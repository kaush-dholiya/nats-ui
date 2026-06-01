package main

import (
	"log"

	"nats-ui/api"
	natsBridge "nats-ui/nats"
	"nats-ui/store"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	// Init connection store (JSON file at ~/.nats-ui/connections.json)
	connStore, err := store.NewConnectionStore()
	if err != nil {
		log.Fatalf("failed to init connection store: %v", err)
	}

	// Init NATS bridge
	bridge := natsBridge.NewBridge()

	// Init HTTP server
	app := fiber.New(fiber.Config{
		AppName: "NATS UI Backend",
	})

	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:5173,http://localhost:4173",
		AllowHeaders: "Origin, Content-Type, Accept",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
	}))

	// Register all routes
	handler := api.NewHandler(connStore, bridge)
	handler.RegisterRoutes(app)

	log.Println("NATS UI Backend running on :8080")
	log.Fatal(app.Listen(":8080"))
}
