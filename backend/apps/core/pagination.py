"""Standard pagination for all DRF list endpoints.

Every list endpoint in DentaCRM returns the exact envelope required by
PROJECT_BRIEF.md § "Pagination format":

    {"count": 42, "next": "...?page=2", "previous": null, "results": [...]}

DRF's built-in :class:`PageNumberPagination` already produces this shape,
so we subclass it to (a) allow the client to override ``page_size`` and
(b) centralise the default and max page sizes in one place.
"""
from __future__ import annotations

from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Uniform pagination for every list endpoint.

    Attributes:
        page_size: Default number of items per page when the client does
            not specify ``page_size``.
        page_size_query_param: Query-string param the client uses to
            request a different page size, e.g. ``?page_size=50``.
        max_page_size: Hard upper bound to protect the backend from a
            client requesting an unbounded page and exhausting memory.
        page_query_param: The 1-indexed page number, e.g. ``?page=2``.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    page_query_param = "page"
