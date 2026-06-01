package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"nats-ui/models"

	"github.com/google/uuid"
)

type ConnectionStore struct {
	mu          sync.RWMutex
	connections []models.Connection
	filePath    string
}

func NewConnectionStore() (*ConnectionStore, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	dir := filepath.Join(home, ".nats-ui")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	filePath := filepath.Join(dir, "connections.json")
	s := &ConnectionStore{filePath: filePath}

	if err := s.load(); err != nil && !os.IsNotExist(err) {
		return nil, err
	}

	return s, nil
}

func (s *ConnectionStore) load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &s.connections)
}

func (s *ConnectionStore) save() error {
	data, err := json.MarshalIndent(s.connections, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0600)
}

func (s *ConnectionStore) List() []models.Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]models.Connection, len(s.connections))
	for i, c := range s.connections {
		c.Password = "" // never expose password in list
		result[i] = c
	}
	return result
}

func (s *ConnectionStore) Get(id string) (*models.Connection, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.connections {
		if c.ID == id {
			return &c, true
		}
	}
	return nil, false
}

func (s *ConnectionStore) Create(c models.Connection) (models.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c.ID = uuid.NewString()
	s.connections = append(s.connections, c)
	return c, s.save()
}

func (s *ConnectionStore) Update(id string, updated models.Connection) (models.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.connections {
		if c.ID == id {
			updated.ID = id
			if updated.Password == "" {
				updated.Password = c.Password // preserve password if not changed
			}
			s.connections[i] = updated
			return updated, s.save()
		}
	}
	return models.Connection{}, os.ErrNotExist
}

func (s *ConnectionStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.connections {
		if c.ID == id {
			s.connections = append(s.connections[:i], s.connections[i+1:]...)
			return s.save()
		}
	}
	return os.ErrNotExist
}
