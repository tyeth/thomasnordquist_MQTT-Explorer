import { Base64Message } from './Base64Message'
import { QoS } from '../DataSource/MqttSource'
import { MemoryConsumptionExpressedByLength } from './RingBuffer'

export interface Message extends MemoryConsumptionExpressedByLength {
  // mqtt based info
  payload: Base64Message | null
  messageId?: number
  retain: boolean
  qos: QoS

  // meta info
  length: number
  received: Date

  // Global message counter, not mqtt related
  messageNumber: number

  // Decoder override for this specific message
  decoderFormat?: string
  // For protobuf messages, the specific message type to decode as
  protobufMessageType?: string
}
