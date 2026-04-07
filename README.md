# Message Throttling Gateway

Componente que recibe ráfagas de 100k mensajes y los entrega respetando rate limit de 100 msg/s sin pérdidas.

## Inicio Rápido

```bash
# 1. Configurar entorno
cp .env.example .env

# 2. Levantar servicios  
docker-compose up --build

# 3. Simular 100k mensajes (ráfaga de ~10s)
curl -X POST "http://localhost:3002/simulate?count=100000"

# 4. Monitorear progreso (aumenta ~100/s)
curl -s http://localhost:3000/messages
```

## Pruebas

```bash
# Tests unitarios
cd service-b && npm test
```

## API Endpoints

**Service B (Puerto 3000):**
- `POST /messages` - Recibe mensaje de Plataforma A
- `GET /messages` - Stats globales (pending, sent, failed, retrying)
- `GET /messages/{id}` - Estado de mensaje específico

**Mock A (Puerto 3002):**
- `POST /simulate?count=N` - Simula ráfaga de N mensajes

**Mock C (Puerto 3001):**
- `POST /send-message` - Recibe mensaje de Plataforma B

## Arquitectura y Decisiones Técnicas

### Persistencia: PostgreSQL + Prisma
**Justificación:** Garantía ACID para evitar pérdida de mensajes. Redis sería más rápido pero requiere configuración compleja para durabilidad.

### Throttling: BullMQ + Redis
**Justificación:** Control preciso de 100 msg/s con limiter incorporado. Distribuye envíos uniformemente y maneja reintentos automáticamente.

### Idempotencia
Verifica existencia por ID único antes de procesar. Si Plataforma A reenvía el mismo mensaje, se ignora sin duplicar envío.

### Entrega Garantizada
- **Persistencia:** Todos los mensajes se guardan en BD antes de procesar
- **Reintentos:** 5 intentos con backoff exponencial en fallos 429/5xx  
- **Recuperación:** Worker procesa cola automáticamente al reiniciar

### Estados de Mensaje
- `PENDING`: Recibido, esperando procesamiento
- `RETRYING`: En proceso de envío
- `SENT`: Entregado exitosamente
- `FAILED`: Falló después de 5 reintentos

## Respuestas a Preguntas de Diseño

### 1. ¿Cómo garantizas que ningún mensaje se pierda si el proceso se reinicia?
Todos los mensajes se persisten en PostgreSQL inmediatamente al recibirlos con estado `PENDING`. Al reiniciar, BullMQ automaticamente recupera jobs pendientes de Redis y continúa procesando.

### 2. ¿Cómo escalarías para múltiples instancias sin duplicar envíos?
BullMQ maneja múltiples workers automáticamente - cada job se procesa por una sola instancia. Para escalado adicional: usar Redis Cluster y sharding de la cola por destinatario.

### 3. Tu solución procesa FIFO. ¿En qué escenario necesitarías priorización?
Mensajes urgentes (alertas médicas, emergencias) o usuarios premium. Implementaría con múltiples colas BullMQ: `high-priority`, `normal`, `low-priority` procesadas por workers separados.

## Limitaciones

- **Orden de entrega:** No estrictamente FIFO debido a reintentos
- **Rate limiting:** Basado en worker local, no distribuido
- **Monitoreo:** Métricas básicas, falta dashboard tiempo real

## Stack Tecnológico

- **Node.js + TypeScript**: Desarrollo rápido y type safety
- **BullMQ + Redis**: Queue robusta con persistencia
- **PostgreSQL + Prisma**: Base de datos confiable con ORM moderno  
- **Express**: API REST simple
- **Docker Compose**: Orquestación local fácil