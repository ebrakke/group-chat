package files

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ebrakke/relay-chat/internal/db"
)

var ErrNotFound = errors.New("file not found")
var ErrTooLarge = errors.New("file too large")

type File struct {
	ID           int64  `json:"id"`
	MessageID    *int64 `json:"messageId,omitempty"`
	Filename     string `json:"-"`
	OriginalName string `json:"originalName"`
	MimeType     string `json:"mimeType"`
	SizeBytes    int64  `json:"sizeBytes"`
	UploaderID   int64  `json:"uploaderId"`
	CreatedAt    string `json:"createdAt"`
}

type Service struct {
	db        *db.DB
	uploadDir string
	maxSize   int64
}

func NewService(database *db.DB, uploadDir string, maxSize int64) *Service {
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Printf("warning: could not create upload dir %s: %v", uploadDir, err)
	}
	return &Service{db: database, uploadDir: uploadDir, maxSize: maxSize}
}

func (s *Service) Upload(uploaderID int64, originalName, mimeType string, size int64, r io.Reader) (*File, error) {
	if size > s.maxSize {
		return nil, ErrTooLarge
	}

	ext := filepath.Ext(originalName)
	randName := randomHex(16) + ext
	diskPath := filepath.Join(s.uploadDir, randName)

	f, err := os.Create(diskPath)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	written, err := io.Copy(f, io.LimitReader(r, s.maxSize+1))
	if err != nil {
		os.Remove(diskPath)
		return nil, fmt.Errorf("write file: %w", err)
	}
	if written > s.maxSize {
		os.Remove(diskPath)
		return nil, ErrTooLarge
	}

	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(
		"INSERT INTO files (filename, original_name, mime_type, size_bytes, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		randName, originalName, mimeType, written, uploaderID, now,
	)
	if err != nil {
		os.Remove(diskPath)
		return nil, err
	}

	id, _ := res.LastInsertId()
	return &File{
		ID:           id,
		Filename:     randName,
		OriginalName: originalName,
		MimeType:     mimeType,
		SizeBytes:    written,
		UploaderID:   uploaderID,
		CreatedAt:    now,
	}, nil
}

func (s *Service) AttachToMessage(fileID, messageID int64) error {
	_, err := s.db.Exec("UPDATE files SET message_id = ? WHERE id = ?", messageID, fileID)
	return err
}

func (s *Service) GetByID(id int64) (*File, error) {
	var f File
	var messageID sql.NullInt64
	err := s.db.QueryRow(
		"SELECT id, message_id, filename, original_name, mime_type, size_bytes, uploader_id, created_at FROM files WHERE id = ?",
		id,
	).Scan(&f.ID, &messageID, &f.Filename, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.UploaderID, &f.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if messageID.Valid {
		f.MessageID = &messageID.Int64
	}
	return &f, nil
}

func (s *Service) ListByMessage(messageID int64) ([]File, error) {
	rows, err := s.db.Query(
		"SELECT id, message_id, filename, original_name, mime_type, size_bytes, uploader_id, created_at FROM files WHERE message_id = ? ORDER BY id",
		messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var f File
		var mid sql.NullInt64
		if err := rows.Scan(&f.ID, &mid, &f.Filename, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.UploaderID, &f.CreatedAt); err != nil {
			return nil, err
		}
		if mid.Valid {
			f.MessageID = &mid.Int64
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (s *Service) Delete(id int64) error {
	f, err := s.GetByID(id)
	if err != nil {
		return err
	}
	os.Remove(filepath.Join(s.uploadDir, f.Filename))
	_, err = s.db.Exec("DELETE FROM files WHERE id = ?", id)
	return err
}

func (s *Service) FilePath(filename string) string {
	clean := filepath.Base(filename)
	return filepath.Join(s.uploadDir, clean)
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func IsImage(mimeType string) bool {
	return strings.HasPrefix(mimeType, "image/")
}
