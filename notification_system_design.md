# Notification System Design

---

## Stage 1: REST API Design

### Endpoints

#### Create a Notification
```
POST /api/notifications
```
**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```
**Request Body:**
```json
{
  "studentID": 1042,
  "type": "Placement",
  "title": "Interview scheduled with Google",
  "message": "Your interview is on 20th June at 10:00 AM.",
  "isRead": false
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "notificationID": "notif_abc123",
  "createdAt": "2024-06-01T08:00:00Z"
}
```

---

#### Get Top 10 Priority Notifications for a Student
```
GET /api/notifications/top?studentID=1042
```
**Response (200 OK):**
```json
{
  "topNotifications": [
    {
      "notificationID": "notif_abc123",
      "type": "Placement",
      "title": "Interview with Google",
      "isRead": false,
      "createdAt": "2024-06-01T08:00:00Z"
    }
  ]
}
```

---

#### Mark Notification as Read
```
PATCH /api/notifications/:notificationID/read
```
**Response (200 OK):**
```json
{
  "success": true,
  "notificationID": "notif_abc123",
  "isRead": true
}
```

---

#### Delete a Notification
```
DELETE /api/notifications/:notificationID
```
**Response (200 OK):**
```json
{
  "success": true,
  "message": "Notification deleted."
}
```

---

### Naming Conventions
- All endpoints use **kebab-case** (`/api/notifications`)
- Resource names are **plural nouns** (`notifications`, not `notification`)
- Sub-actions use descriptive paths (`/read`, not `/markRead`)
- IDs are passed as path parameters for resource-specific operations
- Filters (studentID, type, isRead) are query parameters on collection endpoints

---

## Stage 2 : Database Selection

### SQL vs NoSQL

| Factor | SQL (PostgreSQL) | NoSQL (MongoDB) |
|---|---|---|
| Schema | Rigid, structured | Flexible, schema-less |
| Queries | Complex joins, aggregations | Simple key-value / document reads |
| Transactions | ACID guaranteed | Eventual consistency (by default) |
| Scaling | Vertical (harder to shard) | Horizontal (easy to shard) |

**Choice: PostgreSQL**

Notifications have a predictable, structured schema (studentID, type, message, isRead, timestamps). We need reliable reads with sorting and filtering — SQL handles this cleanly with indexes. NoSQL is unnecessary complexity here unless you're at Google-scale with 100M+ users and need horizontal sharding.

---

### Database Schema

```sql
CREATE TABLE notifications (
  notificationID  SERIAL PRIMARY KEY,
  studentID       INT NOT NULL,
  type            VARCHAR(50) NOT NULL,       -- 'Placement', 'Result', 'Event'
  title           VARCHAR(255) NOT NULL,
  message         TEXT,
  isRead          BOOLEAN DEFAULT FALSE,
  createdAt       TIMESTAMP DEFAULT NOW()
);
```

### Indexing Strategy
```sql
-- Primary index for filtered, sorted reads (the critical query pattern)
CREATE INDEX idx_notifications_student_read_created
ON notifications(studentID, isRead, createdAt DESC);
```

**Why this composite index works:**
- `studentID` narrows to one student's rows
- `isRead` filters unread notifications
- `createdAt DESC` supports sorting without a full table scan

The B-tree index stores rows pre-sorted in this order, so PostgreSQL walks straight to the result without sorting at query time.

---

## Stage 3 : Slow Query Analysis

### The Query
```sql
SELECT * FROM notifications
WHERE studentID = 1042
AND isRead = false
ORDER BY createdAt DESC;
```

### Problems

**1. No index → full table scan**
Without an index on `(studentID, isRead, createdAt)`, PostgreSQL reads every row in the table to find matches. On a table with 10M notifications, this is fatal.

**2. `SELECT *` pulls unnecessary data**
You almost never need every column. Fetching `message TEXT` for 1000 rows when you only need title and createdAt wastes memory and network.

**3. Sorting cost**
Even with a `studentID` index, if `createdAt` isn't part of the index, PostgreSQL fetches matching rows into memory and sorts them — an O(n log n) operation per query.

**4. Why indexing every column individually is wrong**
Separate indexes on `studentID`, `isRead`, and `createdAt` don't help this query. PostgreSQL would pick one, apply it, then filter/sort the rest in memory. Composite indexes are designed for multi-column query patterns.

### Fix

```sql
-- Composite index covering all three conditions
CREATE INDEX idx_notifications_student_read_created
ON notifications(studentID, isRead, createdAt DESC);

-- Rewrite the query to only select what you need
SELECT notificationID, type, title, createdAt
FROM notifications
WHERE studentID = 1042
AND isRead = false
ORDER BY createdAt DESC
LIMIT 10;
```

Adding `LIMIT 10` prevents the database from materializing thousands of matching rows when only the top 10 are needed.

---

## Stage 4 : Performance Optimization

### Redis Caching
Cache the top-10 notifications per student in Redis with a short TTL (30–60 seconds). On a read request, check Redis first. Only hit the database on a cache miss or when a new notification arrives (invalidate the cache on write).

```
Key:   notifications:top10:studentID:1042
Value: JSON array of top 10 notifications
TTL:   60 seconds
```

**Why it matters:** A student dashboard reloading every few seconds hits the DB hundreds of times per minute. Redis absorbs 95%+ of those reads.

### Pagination
Never return all notifications in one response. Use cursor-based pagination:
```
GET /api/notifications?studentID=1042&cursor=<lastCreatedAt>&limit=20
```
Cursor-based pagination is more stable than offset-based (which breaks when new rows are inserted between pages).

### WebSocket for Real-Time Delivery
Use WebSocket (Socket.io) to push new notifications to connected clients instead of having clients poll every N seconds. Polling at scale is a DB hammer.

### Lazy Loading
Load notification content (full `message` text) only when a user clicks a notification — not in the list view. The list view only needs title, type, and timestamp.

### Message Queues
Notification creation and delivery should be decoupled via a queue (RabbitMQ or Kafka). The API writes a notification to the queue and returns 202 Accepted immediately. Workers consume from the queue and handle delivery asynchronously.

### DB Load Reduction
- Read replicas: route all `SELECT` queries to a read replica; writes go to the primary
- Connection pooling: use PgBouncer to cap open DB connections
- Archival: move notifications older than 90 days to cold storage or a separate archive table

---

## Stage 5 : Scalable Notification Delivery

### Problems in Synchronous Pseudocode

**Synchronous processing:** If the email provider is slow or down, the entire request thread blocks. One slow notification delivery stalls all others behind it.

**No retry strategy:** If email sending fails, the notification is silently lost. There's no mechanism to reattempt.

**No transactional integrity:** The notification may be saved to the DB, but if delivery fails halfway through, there's no rollback or record of what was actually delivered.

**No failure isolation:** One failing channel (email) shouldn't block SMS or push notification delivery.

---

### Correct Architecture

```
step1 : API Request
step2 : Write notification to DB (status: PENDING)
step 3 : Publish event to Message Queue (RabbitMQ / Kafka)
step4 : Return 202 Accepted to client
    
    (Async)

step 5 : Worker consumes from queue
    │
    ├── Email Worker - attempt delivery - success: mark DELIVERED
    │                                   - failure: push to retry queue
    │
    ├── SMS Worker - same pattern
    │
    └── Push Worker - same pattern

Retry Queue: exponential backoff (1s → 5s → 30s → 5min)
Dead Letter Queue: messages that fail after max retries land here for manual review
```

**Technologies:**
- **RabbitMQ** for task queues with retry routing (simpler setup, good for this scale)
- **Kafka** if you need event streaming at massive scale and replay capability
- **Dead Letter Queue (DLQ):** failed messages after max retries are routed here — you inspect them rather than silently losing them

---

## Stage 6 — Top 10 Priority Notifications (Working Code)

### Priority Logic
- `Placement` → Priority 1 (highest)
- `Result` → Priority 2
- `Event` → Priority 3
- Within same type → sorted by `createdAt` descending (most recent first)

### Implementation

```javascript
const { fetchData } = require("../services/apiService");
const Log = require("../middleware/logger");

const BASE_URL = "http://4.224.186.213/evaluation-service";

const PRIORITY_MAP = {
  Placement: 1,
  Result: 2,
  Event: 3,
};

const getTopNotifications = async (req, res) => {
  await Log("backend", "info", "handler", "Top notifications request received");

  try {
    const data = await fetchData(`${BASE_URL}/notifications`);
    const notifications = data.notifications;

    if (!notifications || notifications.length === 0) {
      return res.status(200).json({ topNotifications: [] });
    }

    const sorted = [...notifications].sort((a, b) => {
      const priorityA = PRIORITY_MAP[a.type] ?? 99;
      const priorityB = PRIORITY_MAP[b.type] ?? 99;

      if (priorityA !== priorityB) return priorityA - priorityB;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const top10 = sorted.slice(0, 10);

    await Log("backend", "info", "controller", `Returning top ${top10.length} notifications`);

    return res.status(200).json({ topNotifications: top10 });
  } catch (error) {
    await Log("backend", "error", "handler", `Notification fetch failed: ${error.message}`);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getTopNotifications };
```

### Why this sort works
`Array.sort` with a comparator: lower priority number wins. For ties, we parse `createdAt` as a Date and subtract — JavaScript dates subtract as milliseconds, so `b - a` gives descending order (newest first). The spread `[...notifications]` prevents mutating the original API response array.

