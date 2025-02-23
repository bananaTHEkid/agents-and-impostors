class WebSocketService {
  private static instance: WebSocketService;
  private socket: WebSocket | null = null;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public connect(url: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        console.log("WebSocket connection opened");
      };

      this.socket.onmessage = (event) => {
        console.log("WebSocket message received:", event.data);
      };

      this.socket.onclose = () => {
        console.log("WebSocket connection closed");
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    }
  }

  public sendMessage(message: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    } else {
      console.error("WebSocket is not open. Unable to send message.");
    }
  }

  public close(): void {
    if (this.socket) {
      this.socket.close();
    }
  }
}

export default WebSocketService.getInstance();