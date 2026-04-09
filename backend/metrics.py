"""
Prometheus metrics definitions.

All metrics are declared here so they can be imported anywhere in the
application without circular imports.
"""
from prometheus_client import Counter, Gauge, Histogram

# ── Games ────────────────────────────────────────────────────────────
ACTIVE_GAMES = Gauge(
    "battleplanes_active_games",
    "Number of games currently held in memory",
)
GAMES_BY_STATE = Gauge(
    "battleplanes_games_by_state",
    "Number of games broken down by state",
    ["state"],
)
GAMES_CREATED = Counter(
    "battleplanes_games_created_total",
    "Total games created",
    ["mode"],
)
GAMES_FINISHED = Counter(
    "battleplanes_games_finished_total",
    "Total games that reached a winner",
)
GAMES_CLEANED_UP = Counter(
    "battleplanes_games_cleaned_up_total",
    "Stale games removed by background cleanup",
)

# ── WebSocket connections ────────────────────────────────────────────
WS_CONNECTIONS = Gauge(
    "battleplanes_ws_connections",
    "Active WebSocket connections",
)
WS_MESSAGES_RECEIVED = Counter(
    "battleplanes_ws_messages_received_total",
    "Total WebSocket messages received from clients",
)

# ── HTTP ─────────────────────────────────────────────────────────────
HTTP_REQUESTS = Counter(
    "battleplanes_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)
HTTP_REQUEST_DURATION = Histogram(
    "battleplanes_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)
