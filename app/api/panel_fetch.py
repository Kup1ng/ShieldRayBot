"""JSON answers for the React panel from the existing form handlers.

The React panel posts the same forms the server-rendered panel posts (same fields, same CSRF
double-submit token), marked with the ``X-Panel-Fetch: 1`` header. Those handlers finish with a
303 redirect carrying a flash message (``?ok=…`` / ``?err=…``) or re-render a page with an error;
for a marked request this module turns that into ``{"ok", "message", "location"}`` JSON, so every
handler keeps its own authorization, shop isolation and idempotency without being rewritten.
"""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

PANEL_FETCH_HEADER = "x-panel-fetch"

# Query keys the handlers use for their flash messages.
FLASH_OK_KEYS = ("ok", "msg", "saved")
FLASH_ERR_KEYS = ("err", "error", "form_err")
# Cache-busting / flash keys that should not survive into the next screen's address.
DROP_KEYS = frozenset({*FLASH_OK_KEYS, *FLASH_ERR_KEYS, "_"})

LOGIN_PATH = "/login"
# A handler that sends the browser to sign out has found the session unusable.
AUTH_LOST_PATHS = frozenset({LOGIN_PATH, "/logout"})
FALLBACK_ERROR = "درخواست انجام نشد؛ دوباره تلاش کنید."
STATUS_ERRORS = {
    400: "ورودی نامعتبر است.",
    401: "نشست شما تمام شده؛ دوباره وارد شوید.",
    403: "این کار برای حساب شما مجاز نیست.",
    404: "مورد درخواستی پیدا نشد.",
    413: "حجم فایل بیش از حد مجاز است.",
    429: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.",
}

# A handler that re-renders a form with an error leaves its message here (see app.render).
STATE_ERROR_ATTR = "panel_form_error"


def wants_panel_json(request: Request) -> bool:
    return request.headers.get(PANEL_FETCH_HEADER) == "1"


def _first(pairs: list[tuple[str, str]], keys: tuple[str, ...]) -> str:
    for key in keys:
        for name, value in pairs:
            if name == key and value.strip():
                return value.strip()
    return ""


def redirect_payload(location: str) -> tuple[int, dict]:
    """Status and JSON body for a handler's redirect. Only the path and query are kept."""
    parts = urlsplit(location)
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    path = parts.path or "/"
    if path in AUTH_LOST_PATHS:
        return 401, {"ok": False, "auth": False, "message": STATUS_ERRORS[401], "location": LOGIN_PATH}
    error = _first(pairs, FLASH_ERR_KEYS)
    message = error or _first(pairs, FLASH_OK_KEYS)
    # «saved=1» style flags are not messages.
    if message and message.isdigit():
        message = ""
    kept = urlencode([(k, v) for k, v in pairs if k not in DROP_KEYS])
    return 200, {
        "ok": not error,
        "message": message,
        "location": f"{path}?{kept}" if kept else path,
    }


def error_payload(request: Request, response: Response) -> dict:
    message = str(getattr(request.state, STATE_ERROR_ATTR, "") or "").strip()
    return {
        "ok": False,
        "message": message or STATUS_ERRORS.get(response.status_code, FALLBACK_ERROR),
        "status": response.status_code,
    }


def install_panel_fetch(app: FastAPI) -> None:
    @app.middleware("http")
    async def panel_fetch_json(request: Request, call_next):
        response = await call_next(request)
        if not wants_panel_json(request):
            return response
        content_type = (response.headers.get("content-type") or "").lower()
        if 300 <= response.status_code < 400 and "location" in response.headers:
            status, body = redirect_payload(response.headers["location"])
            json_response = JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})
        elif "text/html" in content_type:
            # A form re-rendered with its error, or an error page: never hand HTML to the panel.
            status = response.status_code if response.status_code >= 400 else 422
            json_response = JSONResponse(error_payload(request, response), status_code=status, headers={"Cache-Control": "no-store"})
        else:
            return response
        # Keep cookies the handler set (a fresh session after login, a rotated CSRF token).
        for value in response.headers.getlist("set-cookie"):
            json_response.headers.append("set-cookie", value)
        return json_response
