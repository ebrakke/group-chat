FROM golang:1.24-alpine AS build
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o relay .

FROM alpine:3.20
RUN apk add --no-cache sqlite-libs
WORKDIR /app
COPY --from=build /app/relay .
ENV PORT=3334
EXPOSE 3334
CMD ["./relay"]
