"""Inventory app — materiallar, sarflash yozuvi va omborxona jurnali.

Contains:
    * :class:`Material` — a consumable good tracked by unit (gram, piece, ml).
    * :class:`MaterialUsage` — one row per material consumed inside a
      :class:`~apps.treatments.models.Treatment`. Creating a row
      automatically decrements ``Material.quantity_in_stock`` via
      :mod:`apps.inventory.signals` and appends a
      :class:`MaterialStockLog` (reason=usage).
    * :class:`MaterialStockLog` — append-only audit trail of every stock
      change (usage / restock / adjustment).

Business rules live in :mod:`apps.inventory.services`. Read helpers live
in :mod:`apps.inventory.selectors`. Signals wire model post_save hooks
to the service layer.
"""

default_app_config = "apps.inventory.apps.InventoryConfig"
