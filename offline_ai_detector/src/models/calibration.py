"""Calibration scaffolding for later phases."""

from __future__ import annotations


def supported_calibration_methods() -> tuple[str, ...]:
    return ("temperature_scaling", "platt_scaling")
