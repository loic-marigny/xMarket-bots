import json
import sys
from pathlib import Path

try:
  import joblib  # type: ignore
except ImportError as exc:  # pragma: no cover
  raise SystemExit("joblib is required to load the trend model. Install scripts/ml/requirements.txt.") from exc


def main() -> None:
  raw = sys.stdin.read() or "{}"
  payload = json.loads(raw)
  model_path = Path(payload.get("modelPath") or "")
  if not model_path.exists():
    raise SystemExit(f"Model file not found at {model_path}")
  features = payload.get("features")
  if not isinstance(features, list):
    raise SystemExit("Features payload must be a list.")
  pipeline = joblib.load(model_path)
  prediction = float(pipeline.predict([features])[0])
  sys.stdout.write(json.dumps({"prediction": prediction}))


if __name__ == "__main__":
  main()