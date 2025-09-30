import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Button,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Chip,
  Paper,
} from '@material-ui/core'
import { Autocomplete } from '@material-ui/lab'
import { ExpandMore, Add, Delete, Build } from '@material-ui/icons'
import { GenericProtobufSchemaLoader } from '../../../decoders/protobuf/GenericProtobufSchemaLoader'
import * as protobuf from 'protobufjs'

interface Props {
  onMessageGenerated: (binaryData: Uint8Array, messageType: string) => void
  onError: (error: string) => void
  onGenerateRef?: React.MutableRefObject<(() => Promise<void>) | null>
}

interface FieldValue {
  [key: string]: any
}

interface OneofSelection {
  [oneofName: string]: string | undefined // Selected field name within the oneof
}

export const ProtobufMessageBuilder: React.FC<Props> = ({ onMessageGenerated, onError, onGenerateRef }) => {
  const [selectedMessageType, setSelectedMessageType] = useState<string>('')
  const [messageData, setMessageData] = useState<FieldValue>({})
  const [oneofSelections, setOneofSelections] = useState<OneofSelection>({})
  const [availableTypes, setAvailableTypes] = useState<Array<{ name: string; namespace: string }>>([])
  const [schemaUpdateTrigger, setSchemaUpdateTrigger] = useState(0)

  // Load available message types - rerun when schema folder changes
  useEffect(() => {
    const schemaLoader = GenericProtobufSchemaLoader.getInstance()

    const loadSchemas = () => {
      schemaLoader.getLoadedSchemas().then(schemas => {
        const types = schemas.map(s => ({ name: s.name, namespace: s.namespace }))
        setAvailableTypes(types)
        // Reset selection if the current type is no longer available
        if (selectedMessageType && !types.some(t => t.namespace === selectedMessageType)) {
          setSelectedMessageType('')
          setMessageData({})
          setOneofSelections({})
        }
      })
    }

    // Load schemas initially
    loadSchemas()

    // Listen for schema folder changes
    const handleSchemaChange = () => {
      console.log('[ProtobufMessageBuilder] Schema folder changed, reloading types')
      setSchemaUpdateTrigger(prev => prev + 1)
      loadSchemas()
    }

    schemaLoader.addChangeListener(handleSchemaChange)

    return () => {
      schemaLoader.removeChangeListener(handleSchemaChange)
    }
  }, [schemaUpdateTrigger, selectedMessageType])

  const [selectedSchema, setSelectedSchema] = useState<any>(null)

  useEffect(() => {
    if (!selectedMessageType) {
      setSelectedSchema(null)
      return
    }

    const schemaLoader = GenericProtobufSchemaLoader.getInstance()
    schemaLoader.getLoadedSchemas().then(schemas => {
      const schema = schemas.find(s => s.namespace === selectedMessageType)
      setSelectedSchema(schema)
    })
  }, [selectedMessageType])

  const handleMessageTypeChange = useCallback((event: any, value: { name: string; namespace: string } | null) => {
    const newType = value?.namespace || ''
    setSelectedMessageType(newType)
    setMessageData({})
    setOneofSelections({})
  }, [])

  const buildNestedUpdate = (fieldPath: string, value: any, prevData: any) => {
    if (!fieldPath.includes('.') && !fieldPath.includes('[')) {
      return { ...prevData, [fieldPath]: value }
    }

    // Handle array indices like "field[0]" or "field.subfield[1]"
    const pathWithArrays = fieldPath.replace(/\[(\d+)\]/g, '.$1')
    const pathParts = pathWithArrays.split('.')
    const result = { ...prevData }
    let current = result

    // Navigate to the parent object, creating nested objects/arrays as needed
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i]
      const nextPart = pathParts[i + 1]
      const isNextPartArrayIndex = /^\d+$/.test(nextPart)

      if (!current[part]) {
        current[part] = isNextPartArrayIndex ? [] : {}
      } else if (Array.isArray(current[part])) {
        current[part] = [...current[part]] // Clone arrays
      } else if (typeof current[part] === 'object') {
        current[part] = { ...current[part] } // Clone objects
      } else {
        current[part] = isNextPartArrayIndex ? [] : {}
      }
      current = current[part]
    }

    // Set the final value
    const lastPart = pathParts[pathParts.length - 1]
    if (Array.isArray(current) && /^\d+$/.test(lastPart)) {
      current[parseInt(lastPart)] = value
    } else {
      current[lastPart] = value
    }
    return result
  }

  const updateFieldValue = useCallback((fieldPath: string, value: any) => {
    setMessageData(prev => buildNestedUpdate(fieldPath, value, prev))
  }, [])

  const updateOneofSelection = useCallback((oneofName: string, fieldName: string | undefined) => {
    setOneofSelections(prev => ({
      ...prev,
      [oneofName]: fieldName
    }))

    // Clear data for unselected oneof fields
    if (fieldName === undefined) {
      setMessageData(prev => {
        const newData = { ...prev }
        // Remove all fields from this oneof
        // Note: This is simplified - in reality we'd need the schema to know which fields belong to which oneof
        return newData
      })
    }
  }, [])

  const addRepeatedField = useCallback((fieldPath: string) => {
    setMessageData(prev => {
      const currentArray = getNestedValue(prev, fieldPath) || []
      return buildNestedUpdate(fieldPath, [...currentArray, {}], prev) // Add empty object for message types
    })
  }, [])

  const removeRepeatedField = useCallback((fieldPath: string, index: number) => {
    setMessageData(prev => {
      const currentArray = getNestedValue(prev, fieldPath) || []
      const newArray = currentArray.filter((_: any, i: number) => i !== index)
      return buildNestedUpdate(fieldPath, newArray, prev)
    })
  }, [])

  const generateMessage = useCallback(async () => {
    console.log('[ProtobufMessageBuilder] Generate message called')
    console.log('[ProtobufMessageBuilder] Selected message type:', selectedMessageType)
    console.log('[ProtobufMessageBuilder] Message data:', JSON.stringify(messageData, null, 2))

    if (!selectedMessageType) {
      console.error('[ProtobufMessageBuilder] No message type selected')
      onError('No message type selected')
      return
    }

    try {
      const schemaLoader = GenericProtobufSchemaLoader.getInstance()
      const schemas = await schemaLoader.getLoadedSchemas()
      console.log('[ProtobufMessageBuilder] Available schemas:', schemas.length)

      const schema = schemas.find(s => s.namespace === selectedMessageType)
      console.log('[ProtobufMessageBuilder] Found schema:', schema ? schema.name : 'NOT FOUND')

      if (!schema) {
        console.error('[ProtobufMessageBuilder] Selected message type not found:', selectedMessageType)
        onError('Selected message type not found')
        return
      }

      // Create and encode the message
      console.log('[ProtobufMessageBuilder] Creating message with data:', messageData)
      const message = schema.type.create(messageData)
      console.log('[ProtobufMessageBuilder] Created message object:', message)

      const buffer = schema.type.encode(message).finish()
      console.log('[ProtobufMessageBuilder] Encoded buffer size:', buffer.length)
      console.log('[ProtobufMessageBuilder] Buffer bytes (first 20):', Array.from(buffer.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '))

      console.log('[ProtobufMessageBuilder] Calling onMessageGenerated with buffer and type')
      onMessageGenerated(buffer, selectedMessageType)
      console.log('[ProtobufMessageBuilder] onMessageGenerated called successfully')
    } catch (error) {
      console.error('[ProtobufMessageBuilder] Error generating message:', error)
      console.error('[ProtobufMessageBuilder] Stack trace:', error instanceof Error ? error.stack : 'No stack trace')
      onError(`Failed to generate message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [selectedMessageType, messageData, onMessageGenerated, onError])

  // Expose generateMessage function via ref for external triggering
  useEffect(() => {
    if (onGenerateRef) {
      onGenerateRef.current = generateMessage
    }
  }, [generateMessage, onGenerateRef])

  const renderField = (field: any, fieldPath: string, depth: number = 0) => {
    const isRepeated = field.repeated
    const currentValue = getNestedValue(messageData, fieldPath)
    const indent = depth * 20

    if (isRepeated) {
      return (
        <Box key={fieldPath} style={{ marginLeft: indent, marginBottom: 16 }}>
          <Box display="flex" alignItems="center" marginBottom={1}>
            <Typography variant="body2" style={{ fontWeight: 'bold' }}>
              {field.name} (repeated)
            </Typography>
            <IconButton size="small" onClick={() => addRepeatedField(fieldPath)}>
              <Add />
            </IconButton>
          </Box>
          {(currentValue || []).map((item: any, index: number) => (
            <Box key={index} display="flex" alignItems="center" marginBottom={1}>
              {renderFieldInput(field, `${fieldPath}[${index}]`, item, false)}
              <IconButton size="small" onClick={() => removeRepeatedField(fieldPath, index)}>
                <Delete />
              </IconButton>
            </Box>
          ))}
        </Box>
      )
    }

    return (
      <Box key={fieldPath} style={{ marginLeft: indent, marginBottom: 16 }}>
        {renderFieldInput(field, fieldPath, currentValue, false)}
      </Box>
    )
  }

  const getNestedValue = (obj: any, path: string) => {
    if (!path.includes('.') && !path.includes('[')) {
      return obj[path]
    }

    // Handle array indices like "field[0]" or "field.subfield[1]"
    const pathWithArrays = path.replace(/\[(\d+)\]/g, '.$1')
    const pathParts = pathWithArrays.split('.')
    let current = obj

    for (const part of pathParts) {
      if (current && typeof current === 'object') {
        if (Array.isArray(current) && /^\d+$/.test(part)) {
          // Array index
          current = current[parseInt(part)]
        } else if (current[part] !== undefined) {
          current = current[part]
        } else {
          return undefined
        }
      } else {
        return undefined
      }
    }
    return current
  }

  const findTypeByName = (typeName: string) => {
    if (!selectedSchema?.type) return null

    // Try to find the type in the root namespace
    const root = selectedSchema.type.root
    if (!root) return null

    try {
      // First try direct lookup
      return root.lookup(typeName)
    } catch {
      // If direct lookup fails, try with different namespace combinations
      try {
        // Try looking up in the current message's namespace
        const currentNamespace = selectedSchema.namespace
        const namespaceParts = currentNamespace.split('.')

        // Try progressively shorter namespaces
        for (let i = namespaceParts.length; i >= 0; i--) {
          const namespace = namespaceParts.slice(0, i).join('.')
          const fullTypeName = namespace ? `${namespace}.${typeName}` : typeName

          try {
            return root.lookup(fullTypeName)
          } catch {
            // Continue to next namespace
          }
        }

        // Last resort: search through available types
        const found = availableTypes.find(t =>
          t.name === typeName ||
          t.namespace.endsWith(`.${typeName}`) ||
          t.namespace === typeName
        )

        if (found) {
          return root.lookup(found.namespace)
        }
      } catch {
        return null
      }
    }

    return null
  }

  const renderEnumField = (field: any, fieldPath: string, value: any) => {
    const enumType = field.resolvedType
    if (!enumType || !enumType.values) {
      console.warn(`[ProtobufMessageBuilder] Enum type not resolved for field ${field.name}, falling back to text input`)
      return (
        <TextField
          fullWidth
          label={`${field.name} (enum)`}
          value={getNestedValue(messageData, fieldPath) || value || ''}
          onChange={(e) => updateFieldValue(fieldPath, e.target.value)}
          size="small"
          variant="outlined"
          helperText="Enum type not resolved - using text input"
        />
      )
    }
    const enumValues = Object.keys(enumType.values)

    return (
      <FormControl fullWidth variant="outlined" size="small">
        <InputLabel>{field.name}</InputLabel>
        <Select
          value={value || ''}
          onChange={(e) => updateFieldValue(fieldPath, e.target.value as string)}
          label={field.name}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {enumValues.map((enumValue) => (
            <MenuItem key={enumValue} value={enumValue}>
              {enumValue} ({enumType.values[enumValue]})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  const renderNestedMessageField = (field: any, fieldPath: string, value: any) => {
    const messageType = field.resolvedType
    const currentValue = value || {}
    const fields = messageType.fieldsArray || []
    const oneofs = messageType.oneofsArray || []

    return (
      <Accordion key={fieldPath} variant="outlined" style={{ marginBottom: 8 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="body2" style={{ fontWeight: 'bold' }}>
            {field.name} ({messageType.name})
          </Typography>
          {Object.keys(currentValue).length > 0 && (
            <Chip size="small" label="Has data" style={{ marginLeft: 8 }} />
          )}
        </AccordionSummary>
        <AccordionDetails>
          <Box width="100%">
            {/* Render oneof fields first */}
            {oneofs.map((oneof: any) => (
              <Box key={oneof.name} marginBottom={2}>
                <Typography variant="body2" style={{ fontWeight: 'bold', marginBottom: 8 }}>
                  {oneof.name} (choose one):
                </Typography>
                <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 8 }}>
                  <InputLabel>Select field</InputLabel>
                  <Select
                    value={oneofSelections[`${fieldPath}.${oneof.name}`] || ''}
                    onChange={(e) => updateOneofSelection(`${fieldPath}.${oneof.name}`, e.target.value as string || undefined)}
                    label="Select field"
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {oneof.fieldsArray.map((oneofField: any) => (
                      <MenuItem key={oneofField.name} value={oneofField.name}>
                        {oneofField.name} ({oneofField.type})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {oneofSelections[`${fieldPath}.${oneof.name}`] && (
                  <Box marginLeft={2}>
                    {renderField(
                      oneof.fieldsArray.find((f: any) => f.name === oneofSelections[`${fieldPath}.${oneof.name}`])!,
                      `${fieldPath}.${oneofSelections[`${fieldPath}.${oneof.name}`]}`,
                      1
                    )}
                  </Box>
                )}
              </Box>
            ))}

            {/* Render regular fields (excluding oneof fields) */}
            {fields
              .filter((nestedField: any) => !nestedField.partOf) // Exclude fields that are part of a oneof
              .map((nestedField: any) =>
                renderField(nestedField, `${fieldPath}.${nestedField.name}`, 1)
              )}
          </Box>
        </AccordionDetails>
      </Accordion>
    )
  }

  const renderFieldInput = (field: any, fieldPath: string, value: any, isArrayElement: boolean) => {
    const fieldType = field.type

    // Debug logging
    console.log(`[ProtobufMessageBuilder] Rendering field: ${field.name}, type: ${fieldType}, resolvedType:`, field.resolvedType)

    // Try to resolve the type if resolvedType is missing
    let resolvedType = field.resolvedType
    if (!resolvedType && fieldType && typeof fieldType === 'string') {
      resolvedType = findTypeByName(fieldType)
      console.log(`[ProtobufMessageBuilder] Manual type resolution for ${fieldType}:`, resolvedType)
    }

    // For primitive fields, get the current value from messageData
    // For complex objects (nested messages), use the passed value
    const currentValue = (resolvedType && resolvedType instanceof protobuf.Type)
      ? value
      : getNestedValue(messageData, fieldPath) ?? value

    // Handle enum types
    if (resolvedType && resolvedType instanceof protobuf.Enum) {
      console.log(`[ProtobufMessageBuilder] Rendering enum field: ${field.name}`)
      return renderEnumField({ ...field, resolvedType }, fieldPath, getNestedValue(messageData, fieldPath) ?? value)
    }

    // Handle message types (nested objects)
    if (resolvedType && resolvedType instanceof protobuf.Type) {
      console.log(`[ProtobufMessageBuilder] Rendering nested message field: ${field.name}`)
      return renderNestedMessageField({ ...field, resolvedType }, fieldPath, getNestedValue(messageData, fieldPath) || value)
    }

    // Handle different field types
    switch (fieldType) {
      case 'string':
        return (
          <TextField
            fullWidth
            label={field.name}
            value={currentValue || ''}
            onChange={(e) => updateFieldValue(fieldPath, e.target.value)}
            size="small"
            variant="outlined"
          />
        )

      case 'int32':
      case 'int64':
      case 'uint32':
      case 'uint64':
      case 'sint32':
      case 'sint64':
      case 'fixed32':
      case 'fixed64':
      case 'sfixed32':
      case 'sfixed64':
        return (
          <TextField
            fullWidth
            label={field.name}
            type="number"
            value={currentValue || ''}
            onChange={(e) => updateFieldValue(fieldPath, parseInt(e.target.value) || 0)}
            size="small"
            variant="outlined"
          />
        )

      case 'float':
      case 'double':
        return (
          <TextField
            fullWidth
            label={field.name}
            type="number"
            inputProps={{ step: 'any' }}
            value={currentValue || ''}
            onChange={(e) => updateFieldValue(fieldPath, parseFloat(e.target.value) || 0)}
            size="small"
            variant="outlined"
          />
        )

      case 'bool':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={currentValue || false}
                onChange={(e) => updateFieldValue(fieldPath, e.target.checked)}
                color="primary"
              />
            }
            label={field.name}
          />
        )

      case 'bytes':
        return (
          <TextField
            fullWidth
            label={`${field.name} (base64)`}
            value={currentValue || ''}
            onChange={(e) => updateFieldValue(fieldPath, e.target.value)}
            size="small"
            variant="outlined"
            helperText="Enter base64 encoded data"
          />
        )

      default:
        // Fallback for unknown types
        return (
          <TextField
            fullWidth
            label={`${field.name} (${fieldType})`}
            value={typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : (currentValue || '')}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                updateFieldValue(fieldPath, parsed)
              } catch {
                updateFieldValue(fieldPath, e.target.value)
              }
            }}
            size="small"
            variant="outlined"
            helperText={`Complex type: ${fieldType} (JSON format)`}
            multiline={typeof currentValue === 'object'}
            minRows={typeof currentValue === 'object' ? 3 : 1}
          />
        )
    }
  }

  const renderOneofField = (oneof: any) => {
    const oneofName = oneof.name
    const selectedField = oneofSelections[oneofName]
    const fields = oneof.fieldsArray

    return (
      <Box key={oneofName} marginBottom={2}>
        <Typography variant="body2" style={{ fontWeight: 'bold', marginBottom: 8 }}>
          {oneofName} (choose one):
        </Typography>
        <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 8 }}>
          <InputLabel>Select field</InputLabel>
          <Select
            value={selectedField || ''}
            onChange={(e) => updateOneofSelection(oneofName, e.target.value as string || undefined)}
            label="Select field"
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {fields.map((field: any) => (
              <MenuItem key={field.name} value={field.name}>
                {field.name} ({field.type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {selectedField && (
          <Box marginLeft={2}>
            {renderField(fields.find((f: any) => f.name === selectedField)!, selectedField, 1)}
          </Box>
        )}
      </Box>
    )
  }

  const renderMessageFields = () => {
    if (!selectedSchema) {
      return null
    }

    const messageType = selectedSchema.type
    const fields = messageType.fieldsArray || []
    const oneofs = messageType.oneofsArray || []

    return (
      <Box>
        {/* Render oneof fields first */}
        {oneofs.map((oneof: any) => renderOneofField(oneof))}

        {/* Render regular fields (excluding oneof fields) */}
        {fields
          .filter((field: any) => !field.partOf) // Exclude fields that are part of a oneof
          .map((field: any) => renderField(field, field.name))}

        {/* Raw JSON editor as fallback */}
        <Accordion style={{ marginTop: 16 }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="body2">Raw JSON Editor</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField
              fullWidth
              label="Raw JSON Data"
              multiline
              rows={6}
              value={JSON.stringify(messageData, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  setMessageData(parsed)
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              variant="outlined"
              helperText="Edit the message as JSON"
            />
          </AccordionDetails>
        </Accordion>
      </Box>
    )
  }

  return (
    <Paper style={{ padding: 16, marginBottom: 16 }}>
      <Box marginBottom={2}>
        <Typography variant="h6" gutterBottom>
          <Build style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Protobuf Message Builder
        </Typography>
      </Box>

      <Autocomplete
        options={availableTypes}
        getOptionLabel={(option) => option.name}
        value={availableTypes.find(t => t.namespace === selectedMessageType) || null}
        onChange={handleMessageTypeChange}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Message Type"
            variant="outlined"
            margin="normal"
          />
        )}
        renderOption={(option) => (
          <Box>
            <Typography variant="body2">{option.name}</Typography>
            <Typography variant="caption" color="textSecondary">
              {option.namespace}
            </Typography>
          </Box>
        )}
        fullWidth
      />

      {selectedMessageType && (
        <Box marginTop={2}>
          {renderMessageFields()}

          <Box marginTop={2} display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              color="primary"
              onClick={generateMessage}
              startIcon={<Build />}
            >
              Generate Message
            </Button>
          </Box>
        </Box>
      )}

      {!availableTypes.length && (
        <Box marginTop={2}>
          <Typography variant="body2" color="error">
            No protobuf schemas loaded. Please select a schema folder in settings.
          </Typography>
        </Box>
      )}
    </Paper>
  )
}