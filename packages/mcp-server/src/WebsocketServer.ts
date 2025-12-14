import { WebSocketServer, WebSocket } from 'ws';
import { v7 as uuidV7 } from 'uuid';
import { TaskType } from './constants/enum.js';

interface WSData {
  type: 'heartbeat' | 'task',
  data?: TaskData;
}

interface TaskData {
  taskType: TaskType;
  taskId: string;
  result?: any;
  status: 'pending' | 'success' | 'timeout' | 'failed';
}

export class WebsocketServer {
  private wss: WebSocketServer;

  private wsConnections: {
    key: symbol;
    ws: WebSocket,
    lastHeartbeat: number;
  }[] = [];

  private taskList: {
    wsKey: symbol;
    task: TaskData;
    resolve: (data: TaskData) => void;
  }[] = []

  constructor(port: number, path: string = '/ws') {
    this.wss = new WebSocketServer({ port, path });
    this.wss.on('connection', (ws: WebSocket) => {
      const key = Symbol();

      this.wsConnections.push({
        key,
        ws,
        lastHeartbeat: Date.now(),
      });

      ws.on('message', (data: Buffer) => {
        this.handMessage(key, data);
      });

      ws.on('close', () => {
        this.closeConnection(key);
      });
    });

    this.wss.on('error', (error: unknown) => {
      console.error('WebSocket 错误:', error);
    });

    setInterval(() => {
      this.wsConnections.forEach(item => {
        if (Date.now() - item.lastHeartbeat > 3000) {
          this.closeConnection(item.key);
        } else {
          this.sendHeartbeat(item.key);
        }
      });
    }, 1000);
  }

  /** 派发任务 */
  async distributionTask(taskType: TaskType): Promise<TaskData[]> {
    return Promise.all(this.wsConnections.map(item => {
      const taskId = uuidV7();
      return new Promise<TaskData>((resolve) => {
        // 任务超时
        const t = setTimeout(() => {
          this.handTask({
            taskType,
            taskId,
            status: 'timeout',
            result: 'Timeout'
          });
        }, 1000 * 60 * 3);

        // 添加到任务队列
        this.taskList.push({
          wsKey: item.key,
          task: {
            taskType,
            taskId,
            status: 'pending'
          },
          resolve: (...arg) => {
            clearTimeout(t);
            resolve(...arg);
          },
        });

        // 派发任务
        this.sendMessage(item.key, {
          type: 'task',
          data: {
            taskType,
            taskId,
            status: 'pending'
          }
        });
      });
    }))
  }

  private handTask(task: TaskData) {
    const onTask = this.taskList.find(item => item.task.taskId === task.taskId);
    if (onTask) {
      onTask.resolve(task);
    }
    this.taskList = this.taskList.filter(item => item.task.taskId !== task.taskId);
  }

  private handMessage(key: symbol, data: Buffer) {
    const message = JSON.parse(data.toString()) as WSData;
    const ws = this.wsConnections.find(item => item.key === key)?.ws;
    if (!ws) {
      return;
    }
    switch (message.type) {
      // 更新心跳
      case 'heartbeat':
        this.wsConnections.forEach(item => {
          if (item.key === key) {
            item.lastHeartbeat = Date.now();
          }
        });
        break;
      // 任务处理完成
      case 'task':
        const data = message?.data;
        if (data) {
          this.handTask(data);
        }
        break;
    }
  }

  private sendMessage(key: symbol, data: WSData) {
    const ws = this.wsConnections.find(item => item.key === key)?.ws;
    if (!ws) {
      return;
    }
    ws.send(JSON.stringify(data));
  }

  private closeConnection(key: symbol) {
    const ws = this.wsConnections.find(item => item.key === key)?.ws;
    if (!ws) {
      return;
    }
    ws.close();
    this.wsConnections = this.wsConnections.filter(item => item.key !== key);

    // 取消这个连接的所有任务
    this.taskList.forEach(item => {
      if (item.wsKey === key) {
        this.handTask({
          taskType: item.task.taskType,
          taskId: item.task.taskId,
          status: 'failed',
          result: 'Connection closed'
        });
      }
    });
  }

  private sendHeartbeat(key: symbol) {
    this.sendMessage(key, {
      type: 'heartbeat'
    })
  }

  /**
   * 获取连接信息
   */
  getConnectionsInfo() {
    const now = Date.now();
    return {
      total: this.wsConnections.length,
      connections: this.wsConnections.map((item, index) => ({
        index: index + 1,
        lastHeartbeat: item.lastHeartbeat,
        timeSinceLastHeartbeat: now - item.lastHeartbeat,
        isAlive: now - item.lastHeartbeat <= 3000,
        readyState: item.ws.readyState, // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
        pendingTasks: this.taskList.filter(task => task.wsKey === item.key).length
      }))
    };
  }
}