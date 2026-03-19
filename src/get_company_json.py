import argparse
import json
import os
import sys


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_PATH = os.path.join(PROJECT_ROOT, "src", "data", "company-data.json")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Return the JSON object for a ticker from company-data.json"
    )
    parser.add_argument("--ticker", required=True, help="Ticker symbol (e.g., AAPL)")
    parser.add_argument(
        "--data-file",
        default=DEFAULT_DATA_PATH,
        help="Path to company-data.json (default: src/data/company-data.json)",
    )
    args = parser.parse_args()

    ticker = (args.ticker or "").strip().upper()
    if not ticker:
        print("Ticker is required.", file=sys.stderr)
        return 2

    data_file = args.data_file
    if not os.path.exists(data_file):
        print(f"Data file not found: {data_file}", file=sys.stderr)
        return 2

    with open(data_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print(f"Expected a JSON array in {data_file}", file=sys.stderr)
        return 2

    for obj in data:
        if not isinstance(obj, dict):
            continue
        sym = str(obj.get("symbol") or "").strip().upper()
        if sym == ticker:
            print(json.dumps(obj, ensure_ascii=False, indent=2))
            return 0

    print(f"No company found for ticker: {ticker}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

