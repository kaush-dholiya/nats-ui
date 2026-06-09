package api

import (
	"encoding/json"

	"nats-ui/models"
	natsBridge "nats-ui/nats"
	"nats-ui/store"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

type Handler struct {
	store  *store.ConnectionStore
	bridge *natsBridge.Bridge
}

func NewHandler(s *store.ConnectionStore, b *natsBridge.Bridge) *Handler {
	return &Handler{store: s, bridge: b}
}

func (h *Handler) RegisterRoutes(app *fiber.App) {
	api := app.Group("/api")

	// Connections CRUD
	api.Get("/connections", h.listConnections)
	api.Post("/connections", h.createConnection)
	api.Put("/connections/:id", h.updateConnection)
	api.Delete("/connections/:id", h.deleteConnection)

	// Connect / Disconnect
	api.Post("/connections/:id/connect", h.connect)
	api.Post("/connections/:id/disconnect", h.disconnect)
	api.Get("/connections/:id/status", h.status)

	// NATS operations
	api.Get("/connections/:id/streams", h.getStreamsHandler)
	api.Get("/connections/:id/consumers", h.getConsumersHandler)
	api.Post("/connections/:id/kv", h.createKVBucketHandler)
	api.Get("/connections/:id/kv", h.getKVBucketsHandler)
	api.Get("/connections/:id/kv/:bucket", h.getKVEntriesHandler)
	api.Post("/connections/:id/kv/:bucket", h.putKVHandler)
	api.Delete("/connections/:id/kv/:bucket/:key", h.deleteKVHandler)
	api.Delete("/connections/:id/kv/:bucket", h.deleteKVBucketHandler)
	api.Post("/connections/:id/streams", h.createStream)
	api.Get("/connections/:id/streams/:stream", h.getStreamInfo)
	api.Delete("/connections/:id/streams/:stream", h.deleteStream)
	api.Post("/connections/:id/streams/:stream/purge", h.purgeStream)
	api.Put("/connections/:id/streams/:stream", h.editStream)
	api.Get("/connections/:id/streams/:stream/consumers", h.getConsumers)
	api.Post("/connections/:id/streams/:stream/consumers", h.createConsumer)
	api.Delete("/connections/:id/streams/:stream/consumers/:consumer", h.deleteConsumer)
	api.Post("/connections/:id/streams/:stream/consumers/:consumer/pause", h.pauseConsumer)
	api.Post("/connections/:id/streams/:stream/consumers/:consumer/resume", h.resumeConsumer)
	api.Post("/connections/:id/streams/:stream/messages", h.getStreamMessages)
	api.Post("/connections/:id/publish", h.publish)

	// WebSocket — must have upgrade middleware first, then the handler
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws/:id/subscribe", websocket.New(h.subscribeWS))
}

func (h *Handler) listConnections(c *fiber.Ctx) error {
	return c.JSON(h.store.List())
}

func (h *Handler) createConnection(c *fiber.Ctx) error {
	var conn models.Connection
	if err := c.BodyParser(&conn); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	created, err := h.store.Create(conn)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(created)
}

func (h *Handler) updateConnection(c *fiber.Ctx) error {
	var conn models.Connection
	if err := c.BodyParser(&conn); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	updated, err := h.store.Update(c.Params("id"), conn)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(updated)
}

func (h *Handler) deleteConnection(c *fiber.Ctx) error {
	if err := h.store.Delete(c.Params("id")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

func (h *Handler) connect(c *fiber.Ctx) error {
	conn, ok := h.store.Get(c.Params("id"))
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "connection not found"})
	}
	info, err := h.bridge.Connect(*conn)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "connected", "server": info})
}

func (h *Handler) disconnect(c *fiber.Ctx) error {
	h.bridge.Disconnect(c.Params("id"))
	return c.JSON(fiber.Map{"status": "disconnected"})
}

func (h *Handler) status(c *fiber.Ctx) error {
	connected := h.bridge.IsConnected(c.Params("id"))
	return c.JSON(fiber.Map{"connected": connected})
}

func (h *Handler) getStreamsHandler(c *fiber.Ctx) error {
	// Check if pagination parameters are present
	hasOffset := c.Query("offset") != ""
	hasLimit := c.Query("limit") != ""
	hasSearch := c.Query("search") != ""

	// If any pagination parameter is present, use paginated endpoint
	if hasOffset || hasLimit || hasSearch {
		return h.getStreamsPaginated(c)
	}

	// Otherwise, use the old endpoint for backward compatibility
	return h.getStreams(c)
}

func (h *Handler) getStreams(c *fiber.Ctx) error {
	streams, err := h.bridge.GetStreams(c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(streams)
}

func (h *Handler) getStreamsPaginated(c *fiber.Ctx) error {
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 50)
	search := c.Query("search", "")

	result, err := h.bridge.GetStreamsPaginated(c.Params("id"), offset, limit, search)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(result)
}

func (h *Handler) getConsumersHandler(c *fiber.Ctx) error {
	// Check if pagination parameters are present
	hasOffset := c.Query("offset") != ""
	hasLimit := c.Query("limit") != ""
	hasSearch := c.Query("search") != ""

	// If any pagination parameter is present, use paginated endpoint
	if hasOffset || hasLimit || hasSearch {
		return h.getConsumersPaginated(c)
	}

	// Otherwise, return error (consumers endpoint requires pagination)
	return c.Status(400).JSON(fiber.Map{"error": "pagination parameters required"})
}

func (h *Handler) getConsumersPaginated(c *fiber.Ctx) error {
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 50)
	search := c.Query("search", "")

	result, err := h.bridge.GetConsumersPaginated(c.Params("id"), offset, limit, search)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(result)
}

func (h *Handler) getStreamMessages(c *fiber.Ctx) error {
	var req struct {
		Limit         int                   `json:"limit"`
		ContentFilter *models.ContentFilter `json:"contentFilter"`
		StartSeq      uint64                `json:"startSeq"`  // Start sequence (0 = no filter)
		EndSeq        uint64                `json:"endSeq"`    // End sequence (0 = no filter)
		StartTime     int64                 `json:"startTime"` // Start timestamp in ms (0 = no filter)
		EndTime       int64                 `json:"endTime"`   // End timestamp in ms (0 = no filter)
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	msgs, err := h.bridge.GetStreamMessages(c.Params("id"), c.Params("stream"), req.Limit, req.ContentFilter, req.StartSeq, req.EndSeq, req.StartTime, req.EndTime)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(msgs)
}

func (h *Handler) publish(c *fiber.Ctx) error {
	var req models.PublishRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.bridge.Publish(c.Params("id"), req); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "published"})
}

// Stream management handlers
func (h *Handler) createStream(c *fiber.Ctx) error {
	var req models.StreamConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.bridge.CreateStream(c.Params("id"), req); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "created"})
}

func (h *Handler) getStreamInfo(c *fiber.Ctx) error {
	info, err := h.bridge.GetStreamInfo(c.Params("id"), c.Params("stream"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(info)
}

func (h *Handler) deleteStream(c *fiber.Ctx) error {
	if err := h.bridge.DeleteStream(c.Params("id"), c.Params("stream")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

func (h *Handler) purgeStream(c *fiber.Ctx) error {
	if err := h.bridge.PurgeStream(c.Params("id"), c.Params("stream")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "purged"})
}

func (h *Handler) editStream(c *fiber.Ctx) error {
	var req models.StreamConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.bridge.EditStream(c.Params("id"), c.Params("stream"), req); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "updated"})
}

func (h *Handler) getConsumers(c *fiber.Ctx) error {
	consumers, err := h.bridge.GetConsumers(c.Params("id"), c.Params("stream"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(consumers)
}

func (h *Handler) createConsumer(c *fiber.Ctx) error {
	var req struct {
		Name          string `json:"name"`
		Filter        string `json:"filter"`
		DeliverPolicy string `json:"deliverPolicy"`
		AckPolicy     string `json:"ackPolicy"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.bridge.CreateConsumer(c.Params("id"), c.Params("stream"), req.Name, req.Filter, req.DeliverPolicy, req.AckPolicy); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "created"})
}

func (h *Handler) deleteConsumer(c *fiber.Ctx) error {
	if err := h.bridge.DeleteConsumer(c.Params("id"), c.Params("stream"), c.Params("consumer")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

func (h *Handler) pauseConsumer(c *fiber.Ctx) error {
	if err := h.bridge.PauseConsumer(c.Params("id"), c.Params("stream"), c.Params("consumer")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "paused"})
}

func (h *Handler) resumeConsumer(c *fiber.Ctx) error {
	if err := h.bridge.ResumeConsumer(c.Params("id"), c.Params("stream"), c.Params("consumer")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "resumed"})
}

// KV handlers
func (h *Handler) createKVBucketHandler(c *fiber.Ctx) error {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.bridge.CreateKVBucket(c.Params("id"), req.Name); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "created"})
}

func (h *Handler) getKVBucketsHandler(c *fiber.Ctx) error {
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 50)
	search := c.Query("search", "")

	result, err := h.bridge.GetKVBucketsPaginated(c.Params("id"), offset, limit, search)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(result)
}

func (h *Handler) getKVEntriesHandler(c *fiber.Ctx) error {
	offset := c.QueryInt("offset", 0)
	limit := c.QueryInt("limit", 50)
	search := c.Query("search", "")

	result, err := h.bridge.GetKVEntriesPaginated(c.Params("id"), c.Params("bucket"), offset, limit, search)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(result)
}

func (h *Handler) putKVHandler(c *fiber.Ctx) error {
	var req struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.bridge.PutKV(c.Params("id"), c.Params("bucket"), req.Key, req.Value); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "updated"})
}

func (h *Handler) deleteKVHandler(c *fiber.Ctx) error {
	if err := h.bridge.DeleteKV(c.Params("id"), c.Params("bucket"), c.Params("key")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

func (h *Handler) deleteKVBucketHandler(c *fiber.Ctx) error {
	if err := h.bridge.DeleteKVBucket(c.Params("id"), c.Params("bucket")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "deleted"})
}

func (h *Handler) subscribeWS(c *websocket.Conn) {
	connectionID := c.Params("id")

	// Read subscribe request from first WebSocket message sent by client
	// Send an immediate ping so the client knows the connection is ready
	_ = c.WriteMessage(websocket.TextMessage, []byte(`{"type":"ping"}`))

	var req models.SubscribeRequest
	_, msg, err := c.ReadMessage()
	if err != nil {
		_ = c.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":"failed to read subscribe request"}`))
		return
	}
	if err := json.Unmarshal(msg, &req); err != nil {
		_ = c.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":"invalid subscribe request"}`))
		return
	}

	h.bridge.HandleSubscribeWS(connectionID, req, c)
}
