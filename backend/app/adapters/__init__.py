from .base import AdapterSet, AdapterUnavailable
from .demo import build_demo
from .live import build_live


def build_adapters(settings) -> AdapterSet:
    return build_demo() if settings.mode == "demo" else build_live(settings)


__all__ = ["AdapterSet", "AdapterUnavailable", "build_adapters"]
