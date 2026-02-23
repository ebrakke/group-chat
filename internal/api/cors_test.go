package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSMiddleware(t *testing.T) {
	handler := corsMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		name           string
		origin         string
		method         string
		wantAllowed    bool
		wantStatusCode int
	}{
		{
			name:           "capacitor origin allowed",
			origin:         "capacitor://localhost",
			method:         "GET",
			wantAllowed:    true,
			wantStatusCode: http.StatusOK,
		},
		{
			name:           "http localhost allowed",
			origin:         "http://localhost",
			method:         "GET",
			wantAllowed:    true,
			wantStatusCode: http.StatusOK,
		},
		{
			name:           "preflight returns 204",
			origin:         "capacitor://localhost",
			method:         "OPTIONS",
			wantAllowed:    true,
			wantStatusCode: http.StatusNoContent,
		},
		{
			name:           "same-origin no CORS headers",
			origin:         "",
			method:         "GET",
			wantAllowed:    false,
			wantStatusCode: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, "/api/health", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatusCode {
				t.Errorf("status = %d, want %d", w.Code, tt.wantStatusCode)
			}

			acao := w.Header().Get("Access-Control-Allow-Origin")
			if tt.wantAllowed && acao != tt.origin {
				t.Errorf("ACAO = %q, want %q", acao, tt.origin)
			}
			if !tt.wantAllowed && acao != "" {
				t.Errorf("ACAO = %q, want empty", acao)
			}
		})
	}
}
