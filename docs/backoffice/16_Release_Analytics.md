# TappyAI Back Office — Release Management & Version Analytics

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Design architecture for tracking app releases and analyzing user behavior, performance, and feature adoption broken down by platform and version.

---

## 2. Data Collection — Version Metadata in Events

Every analytics event sent by any platform must include version metadata (see `07_Event_Catalog.md`):

```json
{
  "platform": "ios",
  "app_version": "1.3.0",
  "build_number": "142",
  "os_name": "iOS",
  "os_version": "18.1",
  "device_type": "phone"
}
```

This data flows into `track_events` and aggregates into `version_analytics` via the daily snapshot cron.

### Platform-Specific Version Identification

| Platform | `app_version` | `build_number` |
|---|---|---|
| Web | `NEXT_PUBLIC_APP_VERSION` env var (e.g. git SHA short or semver) | Build number or git commit count |
| Android | `BuildConfig.VERSION_NAME` | `BuildConfig.VERSION_CODE` |
| iOS | `Bundle.main.infoDictionary["CFBundleShortVersionString"]` | `CFBundleVersion` |

---

## 3. Version Analytics Dashboard

### 3.1 Version Adoption Chart

```
Version Adoption — iOS
[Stacked area chart showing % of MAU on each version over 30 days]

v1.3.0: ████████████████████ 78%
v1.2.1: ████████ 18%
v1.2.0: ██ 4%
```

### 3.2 Version Comparison Table

| Version | Platform | Active Users | DAU | D7 Retention | Crash Rate | Avg Session |
|---|---|---|---|---|---|---|
| v1.3.0 | iOS | 12,400 | 8,200 | 43% | 0.1% | 9m 12s |
| v1.2.1 | iOS | 2,800 | 1,400 | 38% | 0.3% | 8m 45s |
| v1.3.0 | Android | 4,100 | 2,800 | 40% | 0.2% | 8m 30s |

### 3.3 Release Detail View

For each release (`app_releases` row):

- Release notes (Vi / EN)
- Active users on this version
- DAU trend since release
- Crash rate trend
- Key feature usage changes vs prior version
- Forced update status

---

## 4. `app_releases` Registry

The `app_releases` table serves as the official release registry.

### Creating a Release Entry

When a new version is shipped, admin creates a release record:

1. Platform (web / android / ios)
2. Version number
3. Build number
4. Release notes (Vi + EN)
5. Is forced update? (forces older versions to update)
6. Minimum supported version (versions below this cannot use the app)

### Forced Update Mechanism

The existing `/api/version` endpoint is extended to:

```json
{
  "version": "1.3.0",
  "platform": "ios",
  "forced_update_available": true,
  "minimum_supported_version": "1.2.0",
  "latest_version": "1.3.0"
}
```

Apps check this on launch and show an update prompt if `forced_update_available` and `current_version < minimum_supported_version`.

---

## 5. Crash & Error Tracking

### Error Events

Crashes / errors tracked via `app_error_occurred` event (see `07_Event_Catalog.md`):

```json
{
  "event_type": "app_error_occurred",
  "properties": {
    "error_type": "crash" | "js_error" | "network_error",
    "error_message": "...",
    "screen_name": "...",
    "stack_trace": "..." (optional, truncated)
  }
}
```

### Crash Rate Calculation

```
crash_rate = COUNT(app_error_occurred WHERE error_type=crash) 
           / COUNT(app_session_started)
           × 100
```

Per version, per platform, per day.

### `version_analytics` Population

The `analytics-snapshot` cron joins `track_events` with version metadata to produce:

```
version_analytics (per platform per version per day):
  active_users = COUNT DISTINCT user_id
  crash_count  = COUNT WHERE event_type = 'app_error_occurred' AND error_type = 'crash'
  error_count  = COUNT WHERE event_type = 'app_error_occurred'
  avg_session_sec = AVG session duration for this version
```

---

## 6. Release Comparison Feature

Admins can select two versions and compare:

| Metric | v1.2.1 | v1.3.0 | Delta |
|---|---|---|---|
| D7 Retention | 38% | 43% | +5% 🟢 |
| Crash Rate | 0.3% | 0.1% | -0.2% 🟢 |
| Avg Session | 8m 45s | 9m 12s | +27s 🟢 |
| AI Chat usage | 61% | 67% | +6% 🟢 |
| Food feature usage | 18% | 22% | +4% 🟢 |

---

## 7. Rollout Monitoring

When a new version is released, a "Release Monitor" view shows:

- Adoption % (users on new version / total active users)
- Adoption curve (chart: % on new version per day since release)
- Crash rate comparison: new version vs prior
- Error rate comparison

This allows early detection of regressions in new releases.

---

*End of Release Analytics Architecture*
