import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { Decoder } from '../../../backend/src/Model/Decoder'
import { MessageDecoder } from './MessageDecoder'
import { GenericProtobufSchemaLoader } from './protobuf/GenericProtobufSchemaLoader'

export const ProtobufDecoder: MessageDecoder = {
  formats: ['Protobuf'],

  canDecodeTopic(topic: string): boolean {
    // Since this is a generic protobuf decoder, we'll be more conservative
    // and only attempt decoding if schemas are loaded and the topic doesn't
    // match other specific decoders (like Sparkplug)
    const schemaLoader = GenericProtobufSchemaLoader.getInstance()
    const hasSchemas = schemaLoader.getSchemaFolder() !== undefined

    if (!hasSchemas) {
      return false
    }

    // Avoid conflicts with Sparkplug decoder
    if (topic.match(/^spBv1\.0\//)) {
      return false
    }

    // For now, we'll be permissive and try to decode any topic when schemas are loaded
    // Users can configure this behavior later if needed
    console.log('[ProtobufDecoder] Checking topic:', topic, 'Has schemas:', hasSchemas)
    return true
  },

  canDecodeData(data: Base64Message): boolean {
    // Try to detect protobuf data by attempting to decode
    // Protobuf messages typically start with specific byte patterns
    try {
      const buffer = new Uint8Array(data.toBuffer())

      // Basic heuristics for protobuf binary data:
      // - Not empty
      // - Contains some field markers (varint encoded field numbers)
      // - Doesn't look like JSON, XML, or plain text
      if (buffer.length === 0) {
        return false
      }

      // Quick check: if it looks like JSON, it's probably not protobuf
      const firstBytes = buffer.slice(0, Math.min(buffer.length, 10))
      console.log('[ProtobufDecoder] Data first bytes:', Array.from(firstBytes).map(b => b.toString(16)))
      const hasJsonChars = firstBytes.some(
        byte =>
          byte === 0x7b || // {
          byte === 0x5b || // [
          byte === 0x22 // "
      )

      if (hasJsonChars) {
        return false
      }
      // Check for protobuf-like varint field tags (field numbers 1-15 are common)
      // These would be encoded as 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50, 0x58, 0x60, 0x68, 0x70, 0x78
      const hasProtobufMarkers = firstBytes.some(
        byte =>
          (byte >= 0x08 && byte <= 0x78 && byte % 0x08 === 0) || // Common varint field tags
          byte === 0x0a ||
          byte === 0x12 ||
          byte === 0x1a ||
          byte === 0x22 // Length-delimited field tags
      )

      return hasProtobufMarkers
    } catch {
      return false
    }
  },

  decode(input: Base64Message, format: string | undefined) {
    try {
      console.log('[ProtobufDecoder] Starting decode, buffer size:', input.toBuffer().byteLength)
      const buffer = new Uint8Array(input.toBuffer())
      const schemaLoader = GenericProtobufSchemaLoader.getInstance()

      // First, try to get the schemas (this is async, but we'll handle it)
      schemaLoader
        .getLoadedSchemas()
        .then(schemas => {
          console.log('[ProtobufDecoder] Schemas loaded successfully, count:', schemas.length)
          if (schemas.length > 0) {
            console.log('[ProtobufDecoder] Available message types:', schemas.map(s => s.name))
          }
        })
        .catch(error => {
          console.error('[ProtobufDecoder] Schema loading failed:', error)
        })

      // Try to decode the message
      console.log('[ProtobufDecoder] Attempting to decode message...')
      const result = schemaLoader.tryDecodeMessage(buffer)
      console.log('[ProtobufDecoder] Decode result:', result)

      if (result) {
        // Successfully decoded - create formatted JSON message
        const decodedJson = {
          messageType: result.messageType,
          namespace: result.namespace,
          timestamp: new Date().toISOString(),
          data: result.data,
          _meta: {
            decoder: 'Protobuf',
            protobufType: result.messageType,
            protobufNamespace: result.namespace,
            originalSize: buffer.length,
            schemaFolder: schemaLoader.getSchemaFolder(),
          },
        }

        const message = Base64Message.fromString(JSON.stringify(decodedJson, null, 2))
        return { message, decoder: Decoder.PROTOBUF }
      } else {
        // Could not decode - return as hex dump with metadata
        const hexDump = Array.from(buffer)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ')

        const availableTypes = schemaLoader.getAvailableMessageTypes()
        const fallbackJson = {
          messageType: 'Unknown',
          timestamp: new Date().toISOString(),
          rawData: {
            hex: hexDump,
            length: buffer.length,
            firstBytes: Array.from(buffer.slice(0, 16)),
          },
          _meta: {
            decoder: 'Protobuf',
            protobufType: 'Unknown',
            originalSize: buffer.length,
            error: 'Could not determine message type - showing raw data',
            schemaFolder: schemaLoader.getSchemaFolder(),
            availableMessageTypes: availableTypes,
          },
        }

        const message = Base64Message.fromString(JSON.stringify(fallbackJson, null, 2))
        return { message, decoder: Decoder.PROTOBUF }
      }
    } catch (error) {
      return {
        error: `Failed to decode Protobuf message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        decoder: Decoder.NONE,
      }
    }
  },
}