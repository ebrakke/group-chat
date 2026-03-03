// Package calendar manages group calendar events.
package calendar

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
)

var ErrNotFound = errors.New("calendar event not found")

const (
	maxTitleLen   = 200
	maxCommentsLen = 2000
)

type CalendarEvent struct {
	ID            int64   `json:"id"`
	Title         string  `json:"title"`
	StartTime     string  `json:"startTime"`
	EndTime       string  `json:"endTime"`
	Comments      string  `json:"comments"`
	CreatedBy     int64   `json:"createdBy"`
	CreatedByName string  `json:"createdByName,omitempty"`
	UpdatedBy     *int64  `json:"updatedBy,omitempty"`
	UpdatedByName string  `json:"updatedByName,omitempty"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

func validateEvent(title, startTime, endTime, comments string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("title is required")
	}
	if len(title) > maxTitleLen {
		return fmt.Errorf("title must be %d characters or less", maxTitleLen)
	}
	if len(comments) > maxCommentsLen {
		return fmt.Errorf("comments must be %d characters or less", maxCommentsLen)
	}
	st, err := time.Parse(time.RFC3339, startTime)
	if err != nil {
		return fmt.Errorf("startTime must be a valid RFC 3339 timestamp: %w", err)
	}
	et, err := time.Parse(time.RFC3339, endTime)
	if err != nil {
		return fmt.Errorf("endTime must be a valid RFC 3339 timestamp: %w", err)
	}
	if !et.After(st) {
		return errors.New("endTime must be after startTime")
	}
	return nil
}

// Create creates a new calendar event.
func (s *Service) Create(userID int64, title, startTime, endTime, comments string) (*CalendarEvent, error) {
	title = strings.TrimSpace(title)
	if err := validateEvent(title, startTime, endTime, comments); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		`INSERT INTO calendar_events (title, start_time, end_time, comments, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		title, startTime, endTime, comments, userID, now, now,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// Update updates an existing calendar event.
func (s *Service) Update(id, userID int64, title, startTime, endTime, comments string) (*CalendarEvent, error) {
	title = strings.TrimSpace(title)
	if err := validateEvent(title, startTime, endTime, comments); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		`UPDATE calendar_events SET title = ?, start_time = ?, end_time = ?, comments = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
		title, startTime, endTime, comments, userID, now, id,
	)
	if err != nil {
		return nil, err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return nil, ErrNotFound
	}
	return s.GetByID(id)
}

// Delete removes a calendar event.
func (s *Service) Delete(id int64) error {
	res, err := s.db.Exec("DELETE FROM calendar_events WHERE id = ?", id)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// GetByID returns a calendar event by ID with creator/updater names.
func (s *Service) GetByID(id int64) (*CalendarEvent, error) {
	var e CalendarEvent
	var updatedBy sql.NullInt64
	var updatedByName sql.NullString
	err := s.db.QueryRow(`
		SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.comments,
		       ce.created_by, u1.username AS created_by_name,
		       ce.updated_by, u2.username AS updated_by_name,
		       ce.created_at, ce.updated_at
		FROM calendar_events ce
		JOIN users u1 ON ce.created_by = u1.id
		LEFT JOIN users u2 ON ce.updated_by = u2.id
		WHERE ce.id = ?
	`, id).Scan(
		&e.ID, &e.Title, &e.StartTime, &e.EndTime, &e.Comments,
		&e.CreatedBy, &e.CreatedByName,
		&updatedBy, &updatedByName,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if updatedBy.Valid {
		e.UpdatedBy = &updatedBy.Int64
		e.UpdatedByName = updatedByName.String
	}
	return &e, nil
}

// List returns all calendar events ordered by start_time ascending.
func (s *Service) List() ([]CalendarEvent, error) {
	rows, err := s.db.Query(`
		SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.comments,
		       ce.created_by, u1.username AS created_by_name,
		       ce.updated_by, u2.username AS updated_by_name,
		       ce.created_at, ce.updated_at
		FROM calendar_events ce
		JOIN users u1 ON ce.created_by = u1.id
		LEFT JOIN users u2 ON ce.updated_by = u2.id
		ORDER BY ce.start_time ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

// ListRange returns events that overlap the given [from, to] range (ISO 8601).
// Overlap: event.start_time <= to AND event.end_time >= from.
func (s *Service) ListRange(from, to string) ([]CalendarEvent, error) {
	_, errFrom := time.Parse(time.RFC3339, from)
	_, errTo := time.Parse(time.RFC3339, to)
	if errFrom != nil || errTo != nil {
		return nil, errors.New("from and to must be valid RFC 3339 timestamps")
	}
	rows, err := s.db.Query(`
		SELECT ce.id, ce.title, ce.start_time, ce.end_time, ce.comments,
		       ce.created_by, u1.username AS created_by_name,
		       ce.updated_by, u2.username AS updated_by_name,
		       ce.created_at, ce.updated_at
		FROM calendar_events ce
		JOIN users u1 ON ce.created_by = u1.id
		LEFT JOIN users u2 ON ce.updated_by = u2.id
		WHERE ce.start_time <= ? AND ce.end_time >= ?
		ORDER BY ce.start_time ASC
	`, to, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

func scanEvents(rows *sql.Rows) ([]CalendarEvent, error) {
	var list []CalendarEvent
	for rows.Next() {
		var e CalendarEvent
		var updatedBy sql.NullInt64
		var updatedByName sql.NullString
		if err := rows.Scan(
			&e.ID, &e.Title, &e.StartTime, &e.EndTime, &e.Comments,
			&e.CreatedBy, &e.CreatedByName,
			&updatedBy, &updatedByName,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if updatedBy.Valid {
			e.UpdatedBy = &updatedBy.Int64
			e.UpdatedByName = updatedByName.String
		}
		list = append(list, e)
	}
	return list, rows.Err()
}
