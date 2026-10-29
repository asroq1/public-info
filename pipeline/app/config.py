import os

from dotenv import load_dotenv

load_dotenv()

SERVICE_KEY = os.getenv("GOV24_SERVICE_KEY", "")
BASE_URL = os.getenv("GOV24_BASE_URL", "https://api.odcloud.kr/api/gov24/v3")
DB_PATH = os.getenv("DB_PATH", "benefit.db")
