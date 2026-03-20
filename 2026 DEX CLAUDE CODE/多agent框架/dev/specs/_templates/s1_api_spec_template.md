# API Spec: {Feature Name}

> **Source**: Extracted from `s1_dev_spec.md` Section 4.1
> **Purpose**: Shared API contract between frontend and backend -- single source of truth
> **Created**: {YYYY-MM-DD HH:mm}

---

## Overview

{One-sentence description of the API changes involved in this feature}

**Base URL**: `/api/v1/`
**Authentication**: {Bearer JWT / Session Cookie / API Key / None}

---

## Endpoints

### 1. {Action Description}

```
{METHOD} {/path}
Authorization: {auth_scheme}
Content-Type: application/json
```

**Parameters**

| Name | Location | Type | Required | Default | Description |
|------|----------|------|----------|---------|-------------|
| `{param}` | query/path/body | string | Yes/No | - | {Description} |

**Request Body**
```json
{
  "field1": "value1",
  "field2": 123
}
```

| Field | Type | Required | Validation Rules | Description |
|-------|------|----------|-----------------|-------------|
| `field1` | string | Yes | 1~200 chars | {Description} |
| `field2` | int | No | >= 0 | {Description} |

**Response -- Success**
```json
{
  "success": true,
  "data": {
    "id": "guid-string",
    "result": "value"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.id` | string (GUID) | {Description} |
| `data.result` | string | {Description} |

**Response -- Error**
```json
{
  "success": false,
  "message": "Error description"
}
```

**Error Codes**

| HTTP Status | Error Code | Description | Trigger Condition |
|-------------|-----------|-------------|-------------------|
| 400 | `INVALID_INPUT` | Input validation failed | {Condition} |
| 404 | `NOT_FOUND` | Resource does not exist | {Condition} |

**Caching Strategy** (optional)

| Item | Value |
|------|-------|
| Cache Key | `{prefix}:{params}` |
| TTL | {N} seconds |

---

### 2. {Action Description}

(Same format as above -- one section per endpoint)

---

## Shared Definitions

### Shared DTOs (optional)

> If multiple endpoints share the same response structure, define it once here.

```json
{
  "sharedField": "type definition"
}
```

### Shared Error Codes (optional)

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 401 | `UNAUTHORIZED` | Not authenticated or session expired |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 500 | `INTERNAL_ERROR` | Internal server error |

---

## Notes

- {Any supplementary notes on API design decisions}
- {Version compatibility remarks}
