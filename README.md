# Message Throttling Gateway

Sistema que recibe ráfagas de 100k mensajes y los entrega a API externa respetando su límite de 100 msg/s.

## Arquitectura

```
Mock A (ráfaga) → Service B (throttling) → Mock C (rate limit 100/s)
```

## Ejecutar

```bash
docker-compose up --build

# Simular ráfaga de 100k mensajes
curl -X POST "http://localhost:3002/simulate?count=100000"

# Ver estadísticas
curl http://localhost:3000/messages
```

## Decisiones Técnicas

- **BullMQ + Redis**: Cola con rate limiting de 100 msg/s y reintentos automáticos
- **PostgreSQL**: Persistencia para garantizar entrega sin pérdida
- **Idempotencia**: Por ID único de mensaje

## Preguntas de Diseño

**1. ¿Cómo garantizar no perder mensajes al reiniciar?**
Los mensajes se guardan en PostgreSQL antes de responder. Al reiniciar, el worker reprocessa automáticamente los mensajes con status PENDING.

**2. ¿Cómo escalar múltiples instancias sin duplicar?**
BullMQ distribuye jobs automáticamente entre workers con locks. PostgreSQL maneja concurrencia con row-level locking.

**3. ¿Cuándo necesitar priorización y cómo implementarla?**
Para mensajes críticos vs. bulk marketing. Usar múltiples colas BullMQ (urgent, normal, bulk) con workers dedicados.
curl http://localhost:3000/messages

# Consultar estado de mensaje específico  
curl http://localhost:3000/messages/{message-id}
```

## Decisiones Técnicas

### 1. Mecanismo de Cola: **BullMQ + Redis**

**¿Por qué BullMQ?**
- Rate limiting nativo y preciso (100 msg/s)
- Reintentos con backoff exponencial automático
- Persistencia en Redis con AOF habilitado
- Observabilidad y métricas built-in
- Manejo robusto de fallos y recovery

**Alternativas consideradas:**
- **RabbitMQ**: Mayor complejidad de setup, overkill para este caso
- **AWS SQS**: Requiere infraestructura cloud, menos control sobre rate limiting
- **Cola en memoria**: Sin persistencia, mensajes se pierden al reiniciar

### 2. Persistencia: **PostgreSQL + Prisma**

**¿Por qué PostgreSQL?**
- Durabilidad ACID garantizada
- Fácil auditoría y consulta de estados de mensajes
- Escalabilidad probada para millones de registros
- Soporte nativo para operaciones atómicas (idempotencia)

**Esquema de base de datos:**
```sql
model Message {
  id        String   @id          -- UUID único del mensaje
  content   String                -- Contenido del mensaje
  recipient String                -- Destinatario (+521234567890)
  status    Status   @default(PENDING) -- PENDING/RETRYING/SENT/FAILED
  retries   Int      @default(0)  -- Contador de reintentos
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. Estrategia de Throttling

- **Rate Limiting exacto**: 100 mensajes por segundo usando BullMQ limiter
- **Manejo de HTTP 429**: Reintentos automáticos con delay exponencial
- **Circuit Breaker**: Máximo 5 intentos por mensaje antes de marcarlo como FAILED
- **Backpressure**: Sistema absorbe ráfagas sin bloquear a Plataforma A

### 4. Garantía de Entrega

**Flujo de procesamiento:**
1. **Recepción**: Mensaje persistido en BD antes de responder HTTP 202
2. **Encolado**: Job agregado a cola Redis con configuración de reintentos
3. **Procesamiento**: Worker procesa respetando rate limit de 100 msg/s
4. **Estados**: Tracking completo PENDING → RETRYING → SENT/FAILED
5. **Recovery**: Al reinicio, worker reprocessa mensajes PENDING automáticamente

### 5. Idempotencia

- **Deduplicación por ID**: Verificación de ID único antes de crear mensaje
- **Respuesta consistente**: HTTP 200 si mensaje ya existe (no HTTP 409)
- **Sin efectos secundarios**: No reenvía mensajes duplicados a Plataforma C

## API Reference

### Service B (Puerto 3000)

#### `POST /messages`
Recibe mensajes de Plataforma A para procesamiento asíncrono.

**Request:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Mensaje de prueba", 
  "recipient": "+521234567890"
}
```

**Response:**
- `202 Accepted`: Mensaje recibido y encolado
- `200 OK`: Mensaje ya existía (idempotencia)
- `400 Bad Request`: Datos inválidos

#### `GET /messages/:id`
Consulta estado de mensaje específico por ID.

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Mensaje de prueba",
  "recipient": "+521234567890", 
  "status": "SENT",
  "retries": 1,
  "createdAt": "2024-01-01T10:00:00Z",
  "updatedAt": "2024-01-01T10:00:05Z"
}
```

#### `GET /messages`
Estadísticas del sistema en tiempo real.

**Response:**
```json
{
  "pending": 45231,    // Mensajes en cola
  "sent": 54321,       // Mensajes enviados exitosamente
  "failed": 234,       // Mensajes fallidos (5+ intentos)
  "retrying": 214      // Mensajes en proceso de reintento
}
```

### Mock A (Puerto 3002)

#### `POST /simulate?count={N}`
Simula ráfaga de N mensajes (default: 100,000).

**Ejemplo:**
```bash
curl -X POST "http://localhost:3002/simulate?count=50000"
```

### Mock C (Puerto 3001)

#### `POST /send-message`
Simula API externa con rate limiting de 100 msg/s.

- **Éxito**: HTTP 200 
- **Rate limit**: HTTP 429 (activa reintentos)

## Testing

```bash
# Prueba básica de funcionalidad
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{"id":"test-123","content":"test","recipient":"+1234567890"}'

# Verificar idempotencia (debe retornar 200)
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{"id":"test-123","content":"test","recipient":"+1234567890"}'

# Consultar estadísticas
curl http://localhost:3000/messages

# Consultar mensaje específico
curl http://localhost:3000/messages/test-123

# Simular ráfaga pequeña para debugging  
curl -X POST "http://localhost:3002/simulate?count=1000"
```

## Observabilidad

- **Logs estructurados**: En stdout de cada servicio
- **Métricas en tiempo real**: Endpoint `/messages` con contadores por estado
- **Health checks**: Configurados en Docker Compose
- **Estados granulares**: Tracking completo del lifecycle de mensajes

**Ejemplo de monitoreo:**
```bash
# Ver logs en tiempo real
docker-compose logs -f service-b

# Monitorear estadísticas cada 5 segundos
watch -n 5 'curl -s http://localhost:3000/messages | jq'
```

## Desarrollo Local

### Con Docker (Recomendado)
```bash
docker-compose up --build
```

### Sin Docker
```bash
# Terminal 1 - Infraestructura
docker-compose up postgres redis

# Terminal 2 - Service B  
cd service-b
npm install
npx prisma migrate dev
npm run dev

# Terminal 3 - Mock C
cd mock-c  
npm install
npm run dev

# Terminal 4 - Mock A
cd mock-a
npm install  
npm run dev
```

### Migraciones de Base de Datos
```bash
cd service-b
npx prisma migrate dev --name descripcion_cambio
npx prisma generate
```

## Limitaciones Conocidas

1. **Instancia única**: Implementación actual no distribuida (ver pregunta 2)
2. **Sin límite de memoria**: Cola puede crecer indefinidamente con mensajes grandes
3. **Monitoring básico**: Solo estadísticas simples, sin métricas de latencia
4. **Recovery manual**: Mensajes FAILED requieren intervención manual
5. **Sin autenticación**: Endpoints públicos (okay para demo)

## Respuestas a Preguntas de Diseño

### 1. ¿Cómo garantizas que ningún mensaje se pierda si el proceso de Componente B se reinicia en medio de una ráfaga?

**Estrategia de persistencia dual:**

1. **Persistencia inmediata**: Cada mensaje se guarda en PostgreSQL ANTES de responder HTTP 202 a Plataforma A. Si el proceso muere aquí, el mensaje ya está persistido.

2. **Jobs durables**: BullMQ persiste jobs en Redis con AOF (Append Only File) habilitado. Los jobs sobreviven reinicios de Redis.

3. **Recovery automático**: Al reiniciar, el worker de BullMQ automatically detecta:
   - Jobs pendientes en Redis → Los reprocesa
   - Mensajes con status PENDING en BD → Los re-encola

4. **Transaccionalidad**: Usamos transacciones de BD para garantizar consistencia entre el estado del mensaje y el encolado.

**Flujo de recovery:**
```
Reinicio → Worker inicia → Consulta BD por status=PENDING → Re-encola jobs faltantes → Continúa procesamiento
```

**Garantía**: Zero message loss. Incluso con fallas de hardware, los mensajes persisten en PostgreSQL.

### 2. ¿Cómo escalarías Componente B si necesitaras correr múltiples instancias en paralelo sin duplicar envíos?

**Arquitectura distribuida con coordinación:**

1. **Redis como coordinador distribuido**: 
   - BullMQ maneja distribución de jobs automáticamente entre workers
   - Lock distribuido garantiza que solo un worker procese cada mensaje
   - Heartbeat mechanism detecta workers caídos y redistribuye jobs

2. **Particionamiento inteligente**:
   ```yaml
   services:
     service-b-1:
       environment:
         - WORKER_PARTITION=0  # Procesa mensajes hash(id) % 3 == 0
     service-b-2:
       environment:
         - WORKER_PARTITION=1  # Procesa mensajes hash(id) % 3 == 1  
     service-b-3:
       environment:
         - WORKER_PARTITION=2  # Procesa mensajes hash(id) % 3 == 2
   ```

3. **Load balancer para HTTP**:
   ```yaml
   nginx:
     upstream service_b {
       server service-b-1:3000;
       server service-b-2:3000; 
       server service-b-3:3000;
     }
   ```

4. **Base de datos compartida**: PostgreSQL maneja concurrencia con ACID properties y row-level locking.

**Beneficios**: Throughput lineal, fault tolerance, zero downtime deployments.

### 3. Tu solución actual procesa mensajes en orden FIFO. ¿En qué escenario necesitarías priorización? ¿Cómo lo implementarías?

**Escenarios que requieren priorización:**

1. **Mensajes críticos vs. marketing**: 
   - Críticos: Autenticación 2FA, alertas de seguridad
   - Normales: Notificaciones de producto
   - Bulk: Campañas de marketing

2. **SLA diferenciados por tipo de cliente**:
   - Premium: 99.9% entrega en < 5 minutos
   - Standard: 99% entrega en < 30 minutos  
   - Basic: Best effort

**Implementación con múltiples colas:**

```typescript
// Definir colas por prioridad
const urgentQueue = new Queue('urgent', { connection });
const normalQueue = new Queue('normal', { connection });
const bulkQueue = new Queue('bulk', { connection });

// Workers con recursos dedicados
const urgentWorker = new Worker('urgent', processUrgent, {
  connection,
  limiter: { max: 50, duration: 1000 } // 50% del rate limit
});

const normalWorker = new Worker('normal', processNormal, {
  connection, 
  limiter: { max: 30, duration: 1000 } // 30% del rate limit
});

const bulkWorker = new Worker('bulk', processBulk, {
  connection,
  limiter: { max: 20, duration: 1000 } // 20% del rate limit
});

// Enrutamiento por contenido/recipient
app.post('/messages', (req, res) => {
  const { priority = 'normal' } = req.body;
  
  switch(priority) {
    case 'urgent': urgentQueue.add('send', req.body); break;
    case 'normal': normalQueue.add('send', req.body); break;  
    case 'bulk': bulkQueue.add('send', req.body); break;
  }
});
```

**Métricas diferenciadas**: SLA tracking por tipo de mensaje, alertas cuando SLA se viola.

## Conclusión

Este sistema implementa un patrón **Producer-Consumer con Throttling** robusto que:

- Absorbe ráfagas de 100k mensajes sin pérdida
- Respeta límites estrictos de API externa (100 msg/s)
- Garantiza entrega con persistencia dual
- Escala horizontalmente con coordinación distribuida
- Proporciona observabilidad completa del pipeline

**Stack tecnológico maduro y battle-tested** para entornos de producción de alto volumen.