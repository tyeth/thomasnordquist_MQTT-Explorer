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

    // Only return true if we actually have a good chance of decoding this topic
    // Let other decoders (JSON, String, etc.) have priority for non-protobuf data
    console.log('[ProtobufDecoder] Checking topic:', topic, 'Has schemas:', hasSchemas)
    return false // Let canDecodeData determine if this is protobuf data
  },

  canDecodeData(data: Base64Message): boolean {
    // Only claim we can decode if we actually successfully decode a known message type
    // This prevents false positives with JSON/string data
    try {
      const buffer = new Uint8Array(data.toBuffer())

      if (buffer.length === 0) {
        return false
      }

      // Quick check: if it looks like text data, it's probably not protobuf
      const firstBytes = buffer.slice(0, Math.min(buffer.length, 20))
      const hasTextChars = firstBytes.some(
        byte =>
          byte === 0x7b || // {
          byte === 0x5b || // [
          byte === 0x22 || // "
          byte === 0x3c || // <
          (byte >= 0x20 && byte <= 0x7e && buffer.length < 100) // ASCII printable chars in short messages
      )

      if (hasTextChars) {
        return false
      }

      // Try to actually decode with our schemas - only return true if we succeed
      const schemaLoader = GenericProtobufSchemaLoader.getInstance()
      const result = schemaLoader.tryDecodeMessage(buffer)

      console.log('[ProtobufDecoder] canDecodeData result:', result ? 'SUCCESS' : 'FAILED')
      return result !== undefined
    } catch {
      return false
    }
  },

  decode(input: Base64Message, format: string | undefined) {
    try {
      console.log('[ProtobufDecoder] Starting decode, buffer size:', input.toBuffer().byteLength, 'format:', format)
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

      // If format is specified and not just "Protobuf", try to decode as that specific type
      let result: { messageType: string; namespace: string; data: any } | undefined

      if (format && format !== 'Protobuf') {
        console.log('[ProtobufDecoder] Attempting to decode as specific type:', format)
        const decoded = schemaLoader.decodeKnownMessage(buffer, format)
        if (decoded) {
          // Get the schema info to ensure consistent namespace formatting
          // Prioritize namespace matching over name matching
          const availableTypes = schemaLoader.getAvailableMessageTypes()
          const schemaInfo = availableTypes.find(t => t.namespace === format)
            || availableTypes.find(t => t.name === format)

          result = {
            messageType: schemaInfo?.name || format,
            namespace: schemaInfo?.namespace || format,
            data: decoded
          }
        }
      }

      // Otherwise, try to auto-detect the message type
      if (!result) {
        console.log('[ProtobufDecoder] Attempting to auto-detect message type...')
        result = schemaLoader.tryDecodeMessage(buffer)
        console.log('[ProtobufDecoder] Decode result:', result)
      }

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