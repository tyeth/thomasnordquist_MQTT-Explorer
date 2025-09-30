import * as q from '../../../../../backend/src/Model'
import React, { useMemo, useState, useCallback, useEffect } from 'react'
import CodeDiff from '../CodeDiff'
import { AppState } from '../../../reducers'
import { connect } from 'react-redux'
import { ValueRendererDisplayMode } from '../../../reducers/Settings'
import { Fade, Select, MenuItem, FormControl, InputLabel, Box } from '@material-ui/core'
import { Decoder } from '../../../../../backend/src/Model/Decoder'
import { useDecoder } from '../../hooks/useDecoder'
import { useTreeNodeChanges } from '../../hooks/useTreeNodeChanges'
import { TopicViewModel } from '../../../model/TopicViewModel'
import { GenericProtobufSchemaLoader } from '../../../decoders/protobuf/GenericProtobufSchemaLoader'
import { Base64Message } from '../../../../../backend/src/Model/Base64Message'

interface Props {
  message: q.Message
  treeNode: q.TreeNode<any>
  compareWith?: q.Message
  renderMode: ValueRendererDisplayMode
}

type Language = 'json'

function renderDiff(
  treeNode: q.TreeNode<TopicViewModel>,
  compareWithPreviousMessage: boolean,
  current: string = '',
  previous: string = '',
  title?: string,
  language?: Language
) {
  return (
    <CodeDiff
      treeNode={treeNode}
      previous={previous}
      current={current}
      title={title}
      language={language}
      nameOfCompareMessage={compareWithPreviousMessage ? 'selected' : 'previous'}
    />
  )
}

function renderDiffMode(
  treeNode: q.TreeNode<TopicViewModel>,
  currentStr: string | undefined,
  compareStr: string | undefined,
  currentType: Language | undefined,
  compareType: Language | undefined,
  compareWithPreviousMessage: boolean
) {
  const language = currentType === compareType && compareType === 'json' ? 'json' : undefined

  return <div>{renderDiff(treeNode, compareWithPreviousMessage, currentStr, compareStr, undefined, language)}</div>
}

function renderRawMode(
  treeNode: q.TreeNode<TopicViewModel>,
  currentStr: string | undefined,
  compareStr: string | undefined,
  currentType: Language | undefined,
  compareType: Language | undefined,
  compareWithPreviousMessage: boolean
) {
  return (
    <div>
      {renderDiff(treeNode, compareWithPreviousMessage, currentStr, currentStr, undefined, currentType)}
      <Fade in={Boolean(compareStr)} timeout={400}>
        <div>
          {Boolean(compareStr)
            ? renderDiff(treeNode, compareWithPreviousMessage, compareStr, compareStr, 'selected', compareType)
            : null}
        </div>
      </Fade>
    </div>
  )
}

export const ValueRenderer: React.FC<Props> = ({ treeNode, compareWith: compare, message, renderMode }) => {
  useTreeNodeChanges(treeNode) // Subscribe to TreeNode changes to force re-renders
  const decodeMessage = useDecoder(treeNode)
  const decodedMessage = useMemo(() => decodeMessage(message), [decodeMessage, message])
  const [selectedProtobufType, setSelectedProtobufType] = useState<string>('')
  const [schemaUpdateTrigger, setSchemaUpdateTrigger] = useState(0)

  // Listen for schema folder changes
  useEffect(() => {
    const schemaLoader = GenericProtobufSchemaLoader.getInstance()

    const handleSchemaChange = () => {
      console.log('[ValueRenderer] Schema folder changed, updating compatible types')
      setSchemaUpdateTrigger(prev => prev + 1)
      setSelectedProtobufType('') // Reset selection when schema changes
    }

    schemaLoader.addChangeListener(handleSchemaChange)

    return () => {
      schemaLoader.removeChangeListener(handleSchemaChange)
    }
  }, [])

  // Get compatible protobuf types for the current message
  const compatibleProtobufTypes = useMemo(() => {
    if (decodedMessage?.decoder !== Decoder.PROTOBUF || !message.payload) {
      return []
    }

    try {
      const buffer = new Uint8Array(message.payload.toBuffer())
      const schemaLoader = GenericProtobufSchemaLoader.getInstance()
      // Pass the topic from treeNode for smart sorting
      const topic = treeNode?.path()
      return schemaLoader.getCompatibleMessageTypes(buffer, topic)
    } catch {
      return []
    }
  }, [decodedMessage, message, treeNode, schemaUpdateTrigger])

  // Auto-select the best match: topic + compatible, then topic, then compatible, then first
  useMemo(() => {
    if (compatibleProtobufTypes.length > 0 && !selectedProtobufType) {
      // The array is already sorted with our priority logic, so just take the first one
      setSelectedProtobufType(compatibleProtobufTypes[0].namespace)
    }
  }, [compatibleProtobufTypes, selectedProtobufType])

  // Create a custom decoded message for the selected protobuf type
  const customDecodedMessage = useMemo(() => {
    if (decodedMessage?.decoder !== Decoder.PROTOBUF || !selectedProtobufType || compatibleProtobufTypes.length === 0) {
      return decodedMessage
    }

    const selectedType = compatibleProtobufTypes.find(t => t.namespace === selectedProtobufType)
    if (!selectedType) {
      return decodedMessage
    }

    // Create a new decoded message with the selected type's data
    const customJson = {
      messageType: selectedType.messageType,
      namespace: selectedType.namespace,
      timestamp: new Date().toISOString(),
      data: selectedType.data,
      _meta: {
        decoder: 'Protobuf',
        protobufType: selectedType.messageType,
        protobufNamespace: selectedType.namespace,
        originalSize: message.payload?.toBuffer().byteLength || 0,
        schemaFolder: GenericProtobufSchemaLoader.getInstance().getSchemaFolder(),
        isHighlyCompatible: selectedType.isHighlyCompatible,
      },
    }

    const customMessage = Base64Message.fromString(JSON.stringify(customJson, null, 2))
    return { message: customMessage, decoder: Decoder.PROTOBUF }
  }, [decodedMessage, selectedProtobufType, compatibleProtobufTypes, message])

  const previousMessages = treeNode.messageHistory.toArray()
  const previousMessage = previousMessages[previousMessages.length - 2]
  const compareMessage = compare || previousMessage || message
  const compareWithPreviousMessage = !!compare

  const [currentStr, currentType] = useMemo(
    () => customDecodedMessage?.message?.format(treeNode.type) ?? [],
    [customDecodedMessage, treeNode.type]
  )
  const [compareStr, compareType] = useMemo(
    () => decodeMessage(compareMessage)?.message?.format(treeNode.type) ?? [],
    [compareMessage, decodeMessage, treeNode.type]
  )

  const handleProtobufTypeChange = useCallback((event: React.ChangeEvent<{ value: unknown }>) => {
    setSelectedProtobufType(event.target.value as string)
  }, [])

  function renderValue(
    treeNode: q.TreeNode<TopicViewModel>,
    currentStr: string | undefined,
    compareStr: string | undefined,
    currentType: Language | undefined,
    compareType: Language | undefined,
    renderMode: string,
    compareWithPreviousMessage: boolean
  ) {
    if (!customDecodedMessage) {
      return null
    }

    switch (renderMode) {
      case 'diff':
        return renderDiffMode(treeNode, currentStr, compareStr, currentType, compareType, compareWithPreviousMessage)
      default:
        return renderRawMode(treeNode, currentStr, compareStr, currentType, compareType, compareWithPreviousMessage)
    }
  }

  const renderedValue = useMemo(
    () =>
      renderValue(treeNode, currentStr, compareStr, currentType, compareType, renderMode, compareWithPreviousMessage),
    [treeNode, currentStr, compareStr, currentType, compareType, renderMode, compareWithPreviousMessage]
  )

  const renderProtobufTypeSelector = () => {
    if (decodedMessage?.decoder !== Decoder.PROTOBUF || compatibleProtobufTypes.length <= 1) {
      return null
    }

    return (
      <Box mb={1}>
        <FormControl variant="outlined" size="small" fullWidth>
          <InputLabel>Protobuf Message Type</InputLabel>
          <Select
            value={selectedProtobufType}
            onChange={handleProtobufTypeChange}
            label="Protobuf Message Type"
          >
            {compatibleProtobufTypes.map(type => (
              <MenuItem key={type.namespace} value={type.namespace}>
                {type.messageType}
                {type.isHighlyCompatible ? ' (*)' : ''}
                <span style={{ marginLeft: '8px', fontSize: '0.8em', color: '#666' }}>
                  {type.namespace}
                </span>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    )
  }

  return (
    <div style={{ padding: '0px 0px 8px 0px', width: '100%' }}>
      {decodedMessage?.decoder === Decoder.SPARKPLUG && 'Decoded SparkplugB'}
      {decodedMessage?.decoder === Decoder.PROTOBUF && (
        <div>
          <div>Decoded Protobuf</div>
          {renderProtobufTypeSelector()}
        </div>
      )}
      {renderedValue}
    </div>
  )
}

const mapStateToProps = (state: AppState) => {
  return {
    renderMode: state.settings.get('valueRendererDisplayMode'),
  }
}

export default connect(mapStateToProps)(ValueRenderer)
