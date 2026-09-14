import interconnect from "@system.interconnect"
import storage from "./snapshotStorage.js"

const DATA_TAG = "fangcun.link.v1"
const ACK_TAG = "fangcun.link.ack"
const MAX_CHUNK_SIZE = 1200
const MAX_CHUNKS = 256

function safeParse(value) {
  try { return typeof value === "string" ? JSON.parse(value) : value } catch (e) { return null }
}

class FangcunInterconnect {
  constructor() {
    this.conn = interconnect.instance()
    this.parts = Object.create(null)
    this.snapshot = null
    this.listeners = []
    this.conn.onmessage = ({ data }) => this.receive(data)
    this.conn.onopen = () => this.emit("open")
    this.conn.onclose = () => this.emit("close")
    this.conn.onerror = () => this.emit("error")
    this.loadSnapshot()
  }

  emit(event, value) {
    this.listeners.forEach(listener => {
      try { listener(event, value) } catch (e) { console.error("fangcun link listener", e) }
    })
  }

  on(listener) { this.listeners.push(listener); return this.listeners.length - 1 }

  send(payload) {
    return new Promise((resolve, reject) => {
      this.conn.send({ data: payload, success: resolve, fail: reject })
    })
  }

  async sendAck(transferId, ok, error, revision) {
    const message = { tag: ACK_TAG, transferId, ok: !!ok }
    if (error) message.error = error
    if (revision != null) message.revision = String(revision)
    try { await this.send(message) } catch (e) { console.error("fangcun link ack", e) }
  }

  async receive(raw) {
    const message = safeParse(raw)
    if (!message || !message.tag) return
    if (message.tag !== DATA_TAG) {
      if (message.tag === ACK_TAG) this.emit("ack", message)
      return
    }
    if (message.kind === "snapshot") {
      await this.commitSnapshot(message.payload || message.data, message.transferId || message.messageId)
      return
    }
    if (message.kind !== "chunk" || typeof message.data !== "string") return
    const transferId = String(message.transferId || "")
    const index = Number(message.index)
    const total = Number(message.total)
    if (!transferId || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNKS || index < 0 || index >= total) {
      await this.sendAck(transferId, false, "invalid_chunk")
      return
    }
    let transfer = this.parts[transferId]
    if (!transfer || transfer.total !== total) transfer = this.parts[transferId] = { total, chunks: [], received: 0 }
    if (transfer.chunks[index] == null) { transfer.chunks[index] = message.data; transfer.received++ }
    if (transfer.received !== total) return
    delete this.parts[transferId]
    const payload = safeParse(transfer.chunks.join(""))
    if (!payload) { await this.sendAck(transferId, false, "invalid_json"); return }
    await this.commitSnapshot(payload, transferId)
  }

  async commitSnapshot(payload, transferId) {
    const snapshot = safeParse(payload)
    if (snapshot && (snapshot.type === "handshake" || snapshot.type === "heartbeat")) {
      await this.sendAck(transferId, true)
      return
    }
    if (!snapshot || snapshot.schema !== "fangcun.link.v1" || snapshot.type !== "snapshot") {
      await this.sendAck(transferId, false, "invalid_snapshot")
      return
    }
    const incomingRevision = Number(snapshot.sync && snapshot.sync.revision)
    const currentRevision = Number(this.snapshot && this.snapshot.sync && this.snapshot.sync.revision)
    if (Number.isFinite(incomingRevision) && Number.isFinite(currentRevision) && incomingRevision < currentRevision) {
      await this.sendAck(transferId || snapshot.messageId, true, null, currentRevision)
      return
    }
    this.snapshot = snapshot
    try { await storage.set(JSON.stringify(snapshot)) } catch (e) { console.error("fangcun link storage", e) }
    this.emit("snapshot", snapshot)
    await this.sendAck(transferId || snapshot.messageId, true, null, snapshot.sync && snapshot.sync.revision)
  }

  async loadSnapshot() {
    try {
      const value = safeParse(await storage.get())
      if (value) { this.snapshot = value; this.emit("snapshot", value) }
    } catch (e) { console.error("fangcun link load", e) }
  }

  getSnapshot() { return this.snapshot }
  getState() { try { return this.conn.getApkStatus() } catch (e) { return "unknown" } }
}

export { DATA_TAG, ACK_TAG, MAX_CHUNK_SIZE }
export default new FangcunInterconnect()
