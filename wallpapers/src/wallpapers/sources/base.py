from __future__ import annotations

import json
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..config import DEFAULT_RATE_LIMIT, DEFAULT_RETRIES, DEFAULT_TIMEOUT, USER_AGENT


class SourceError(RuntimeError):
    pass


@dataclass
class Page:
    items: list[dict]
    page: int
    total_pages: int
    endpoint: str
    raw_json: str


class HttpClient:
    def __init__(
        self,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        retries: int = DEFAULT_RETRIES,
        rate_limit: float = DEFAULT_RATE_LIMIT,
    ) -> None:
        self.timeout = timeout
        self.retries = retries
        self.rate_limit = rate_limit
        self._last_request = 0.0

    def get_json(self, url: str) -> tuple[object, str]:
        error: Exception | None = None
        for attempt in range(self.retries + 1):
            elapsed = time.monotonic() - self._last_request
            if elapsed < self.rate_limit:
                time.sleep(self.rate_limit - elapsed)
            request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            self._last_request = time.monotonic()
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    status = getattr(response, "status", 200)
                    body = response.read().decode("utf-8-sig")
                    if status >= 400:
                        raise SourceError(f"HTTP {status}: {url}")
                    try:
                        return json.loads(body), body
                    except json.JSONDecodeError as exc:
                        raise SourceError(f"响应不是 JSON: {url}") from exc
            except (HTTPError, URLError, TimeoutError, SourceError) as exc:
                error = exc
                status = getattr(exc, "code", None)
                if attempt >= self.retries or status not in (None, 429, 500, 502, 503, 504):
                    break
                time.sleep(2**attempt)
        raise SourceError(str(error or "请求失败"))
