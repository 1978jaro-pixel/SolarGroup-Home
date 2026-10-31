from ..timeutil import zone
from .base import AdapterSet, AdapterUnavailable
from .demo import build_demo
from .live import build_live


def build_adapters(settings, store) -> AdapterSet:
    if settings.mode == "demo":
        return build_demo(store, zone(settings.timezone))
    return build_live(settings)


__all__ = ["AdapterSet", "AdapterUnavailable", "build_adapters"]
