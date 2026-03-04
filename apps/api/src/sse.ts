import EventEmitter from "node:events";

export interface SSEMessage {
  data: unknown;
  maxionId: string;
  type: "log" | "step" | "status" | "pr";
}

class SSEBus extends EventEmitter {
  emit(event: string, message: SSEMessage): boolean {
    return super.emit(event, message);
  }

  on(event: string, listener: (message: SSEMessage) => void): this {
    return super.on(event, listener);
  }

  off(event: string, listener: (message: SSEMessage) => void): this {
    return super.off(event, listener);
  }

  publish(maxionId: string, message: SSEMessage): void {
    this.emit(`maxion:${maxionId}`, message);
    this.emit("maxion:*", message);
  }
}

export const sseBus = new SSEBus();
sseBus.setMaxListeners(100);
