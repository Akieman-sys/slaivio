import requests

from app.core.logger import logger


DEFAULT_TIMEOUT = 20


def wazzap_post(url: str, headers: dict, json: dict) -> dict:
    try:
        response = requests.post(
            url,
            headers=headers,
            json=json,
            timeout=DEFAULT_TIMEOUT,
        )
        try:
            data = response.json()
        except ValueError:
            data = {"error": "invalid_wazzap_response"}
        return {
            "ok": response.ok,
            "status_code": response.status_code,
            "data": data,
        }
    except requests.Timeout:
        logger.error("wazzap_timeout")
        return {
            "ok": False,
            "status_code": 504,
            "data": {"error": "wazzap_timeout"},
        }
    except Exception as exc:
        logger.exception("wazzap_http_error")
        return {
            "ok": False,
            "status_code": 500,
            "data": {"error": str(exc)},
        }
