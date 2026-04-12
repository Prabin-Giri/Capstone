"""Central path definitions for the offline AI code detector subproject."""

from pathlib import Path


DETECTOR_ROOT = Path(__file__).resolve().parents[1]
CONFIGS_DIR = DETECTOR_ROOT / "configs"
DATA_DIR = DETECTOR_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
INTERIM_DATA_DIR = DATA_DIR / "interim"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
ARTIFACTS_DIR = DETECTOR_ROOT / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
REPORTS_DIR = ARTIFACTS_DIR / "reports"
FIGURES_DIR = ARTIFACTS_DIR / "figures"
