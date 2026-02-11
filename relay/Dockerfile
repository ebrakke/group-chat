FROM golang:1.24-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o relay .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/relay .
ENV PORT=3334
EXPOSE 3334
CMD ["./relay"]
