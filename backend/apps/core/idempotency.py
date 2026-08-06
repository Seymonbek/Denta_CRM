"""T129 — Idempotency-Key support for unsafe writes.

Problem: POST /api/v1/payments/ is the single highest-risk write in
the app — a slow response over a flaky network causes the client to
retry, and without idempotency support that retry double-records the
payment (money leaves the patient's balance twice, commissions are
recomputed twice, audit log gains a phantom row).

Fix (RFC pattern popularised by Stripe): clients set an
``Idempotency-Key`` header on the retryable request. The first request
with that key executes normally; subsequent requests with the same key
return the *cached* response of the first, so the retry is a no-op at
the database layer.

Semantics:

* Same key + same body payload → replay the cached response.
* Same key + *different* body payload → 409 Conflict.
* No key header → normal create.
* Cache TTL: 24 hours (configurable via ``IDEMPOTENCY_TTL_SECONDS``).
* Scope: keyed by (user id, endpoint path, key) so different users
  cannot collide, and the same key can be reused across endpoints.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response


IDEMPOTENCY_HEADER = "Idempotency-Key"
_META_KEY = "HTTP_IDEMPOTENCY_KEY"
_MAX_KEY_LENGTH = 200
_DEFAULT_TTL = 24 * 60 * 60  # 24 hours


def _extract_key(request: Request) -> str | None:
    """Read the Idempotency-Key header from ``request``.

    Returns ``None`` when unset or malformed so the caller falls
    through to the normal create path.
    """
    raw = request.META.get(_META_KEY, "")
    if not raw:
        return None
    raw = raw.strip()
    if not raw or len(raw) > _MAX_KEY_LENGTH:
        return None
    # Only allow characters commonly seen in trace-id style tokens.
    for ch in raw:
        if not (ch.isalnum() or ch in "-_"):
            return None
    return raw


def _body_hash(request: Request) -> str:
    """Stable content hash of the request body for collision detection.

    Uses the parsed ``request.data`` rather than raw bytes so multipart
    ordering doesn't cause false conflicts, and JSON dumps with sorted
    keys so ``{"a":1,"b":2}`` and ``{"b":2,"a":1}`` hash identically.
    """
    try:
        payload = json.dumps(request.data, sort_keys=True, default=str)
    except (TypeError, ValueError):
        # Fall back to raw bytes on non-JSON payloads.
        payload = repr(request.data)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_key(*, user_id: str, path: str, key: str) -> str:
    """Namespaced cache key. Keeps different users / endpoints isolated."""
    fingerprint = hashlib.sha256(
        f"{user_id}|{path}|{key}".encode("utf-8")
    ).hexdigest()
    return f"idem:{fingerprint}"


class IdempotencyMixin:
    """Mixin for a DRF ``ViewSet`` that makes ``create`` idempotent.

    Usage::

        class PaymentViewSet(IdempotencyMixin, viewsets.ModelViewSet):
            idempotent_actions = {"create"}
            ...

    The mixin wraps ``create`` (and any additional actions listed in
    ``idempotent_actions``) with a lookup against the default cache.
    ``IDEMPOTENCY_TTL_SECONDS`` in Django settings overrides the
    default 24-hour TTL.
    """

    #: Action names (``create``, ``update``, ...) whose response should
    #: be cached for future retries. Subclasses override.
    idempotent_actions: set[str] = {"create"}

    def _idempotency_ttl(self) -> int:
        return int(getattr(settings, "IDEMPOTENCY_TTL_SECONDS", _DEFAULT_TTL))

    def _idempotency_user_id(self, request: Request) -> str:
        user = getattr(request, "user", None)
        if user is None:
            return "anon"
        pk = getattr(user, "pk", None)
        return str(pk) if pk is not None else "anon"

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return self._idempotent_dispatch(
            "create", super().create, request, *args, **kwargs
        )

    def _idempotent_dispatch(
        self,
        action: str,
        wrapped,
        request: Request,
        *args: Any,
        **kwargs: Any,
    ) -> Response:
        if action not in self.idempotent_actions:
            return wrapped(request, *args, **kwargs)

        key = _extract_key(request)
        if key is None:
            return wrapped(request, *args, **kwargs)

        user_id = self._idempotency_user_id(request)
        cache_key = _cache_key(
            user_id=user_id, path=request.path, key=key
        )
        body_hash = _body_hash(request)

        cached = cache.get(cache_key)
        if cached is not None:
            if cached.get("body_hash") != body_hash:
                return Response(
                    {
                        "error": {
                            "code": "IDEMPOTENCY_CONFLICT",
                            "message": (
                                "Bir xil Idempotency-Key qiymati boshqa "
                                "so'rov tanasi bilan qayta yuborildi."
                            ),
                            "details": {
                                "idempotency_key": key,
                                "action": action,
                            },
                        }
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            return Response(
                cached.get("data"),
                status=cached.get("status", status.HTTP_201_CREATED),
                headers={IDEMPOTENCY_HEADER: key, "Idempotency-Replay": "true"},
            )

        response: Response = wrapped(request, *args, **kwargs)

        # Only cache successful responses — retrying a 400 shouldn't
        # persist the failure.
        if 200 <= response.status_code < 300:
            cache.set(
                cache_key,
                {
                    "body_hash": body_hash,
                    "status": response.status_code,
                    "data": response.data,
                },
                self._idempotency_ttl(),
            )
            response[IDEMPOTENCY_HEADER] = key
        return response


__all__ = [
    "IdempotencyMixin",
    "IDEMPOTENCY_HEADER",
]
