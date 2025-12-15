import Editor from './Editor'
import { AttachFileOutlined, FormatAlignLeft } from '@material-ui/icons'
import Message from './Model/Message'
import Navigation from '@material-ui/icons/Navigation'
import PublishHistory from './PublishHistory'
import React, { useCallback, useMemo, useState, useRef, memo } from 'react'
import RetainSwitch from './RetainSwitch'
import TopicInput from './TopicInput'
import { AppState } from '../../../reducers'
import { bindActionCreators } from 'redux'
import { Button, Fab, Theme, Tooltip, withTheme } from '@material-ui/core'
import { connect } from 'react-redux'
import { EditorModeSelect } from './EditorModeSelect'
import { globalActions, publishActions } from '../../../actions'
import { KeyCodes } from '../../../utils/KeyCodes'
import { default as AceEditor } from 'react-ace'
import { ProtobufMessageBuilder } from './ProtobufMessageBuilder'

interface Props {
  connectionId?: string
  topic?: string
  payload?: string
  actions: typeof publishActions
  globalActions: typeof globalActions
  retain: boolean
  editorMode: string
  theme: Theme
}

function useHistory(): [Array<Message>, (topic: string, payload?: string) => void] {
  const [history, setHistory] = useState<Array<Message>>([])
  const amendToHistory = useCallback(
    (topic: string, payload?: string) => {
      // Remove duplicates
      let filteredHistory = history.filter(e => e.payload !== payload || e.topic !== topic)
      filteredHistory = filteredHistory.slice(-7)
      setHistory([...filteredHistory, { topic, payload, sent: new Date() }])
    },
    [history]
  )

  return [history, amendToHistory]
}

function Publish(props: Props) {
  const editorRef = useRef<AceEditor>()
  const protobufGenerateRef = useRef<(() => Promise<void>) | null>(null)
  const [history, amendToHistory] = useHistory()
  const [isGenerating, setIsGenerating] = useState(false)

  const focusEditor = useCallback(() => {
    editorRef.current?.editor.focus()
  }, [editorRef])

  const publish = useCallback(async () => {
    console.log('[Publish] publish function called')
    console.log('[Publish] connectionId:', props.connectionId)
    console.log('[Publish] topic:', props.topic)
    console.log('[Publish] payload length:', props.payload?.length)
    console.log('[Publish] payload preview (first 100 chars):', props.payload?.substring(0, 100))
    console.log('[Publish] retain:', props.retain)
    console.log('[Publish] editor mode:', props.editorMode)

    if (!props.connectionId) {
      console.error('[Publish] No connection ID, aborting publish')
      props.globalActions.showError('No connection available for publishing')
      return
    }

    // Auto-generate protobuf message if in protobuf mode and no payload exists
    if (props.editorMode === 'protobuf' && !props.payload && protobufGenerateRef.current) {
      console.log('[Publish] No payload in protobuf mode, auto-generating message')
      setIsGenerating(true)
      try {
        await protobufGenerateRef.current()
        console.log('[Publish] Auto-generation completed, payload should now be available')
        // Give a small delay to ensure state updates have propagated
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error('[Publish] Auto-generation failed:', error)
        props.globalActions.showError(`Failed to generate protobuf message: ${error instanceof Error ? error.message : 'Unknown error'}`)
        setIsGenerating(false)
        return
      }
      setIsGenerating(false)
    }

    // Check again if we have a payload after potential auto-generation
    if (props.editorMode === 'protobuf' && !props.payload) {
      props.globalActions.showError('No protobuf message generated. Please fill in the required fields and try again.')
      return
    }

    console.log('[Publish] Calling props.actions.publish with connectionId:', props.connectionId)
    props.actions.publish(props.connectionId)
    console.log('[Publish] props.actions.publish called')

    const topic = props.topic || ''
    const payload = props.payload
    if (props.connectionId && topic) {
      console.log('[Publish] Adding to history - topic:', topic, 'payload length:', payload?.length)
      amendToHistory(topic, payload)
    }
  }, [props, props.connectionId, props.topic, props.payload, props.editorMode, amendToHistory, protobufGenerateRef])

  const handleSubmit = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.keyCode === KeyCodes.enter && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        publish()
      }
    },
    [publish]
  )

  return useMemo(
    () => (
      <div style={{ flexGrow: 1, width: '100%' }} onKeyDown={handleSubmit}>
        <TopicInput />
        <div style={{ width: '100%', display: 'block' }}>
          <EditorMode
            focusEditor={focusEditor}
            actions={props.actions}
            globalActions={props.globalActions}
            payload={props.payload}
            editorMode={props.editorMode}
            publish={publish}
            connectionId={props.connectionId}
            isGenerating={isGenerating}
          />
          {props.editorMode === 'protobuf' ? (
            <ProtobufMessageBuilder
              onMessageGenerated={(binaryData, messageType) => {
                console.log('[Publish] onMessageGenerated called')
                console.log('[Publish] Binary data length:', binaryData.length)
                console.log('[Publish] Binary data bytes (first 20):', Array.from(binaryData.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '))
                console.log('[Publish] Message type:', messageType)

                // Convert binary data to base64 for transmission
                const base64 = btoa(String.fromCharCode(...binaryData))
                console.log('[Publish] Base64 encoded length:', base64.length)
                console.log('[Publish] Base64 preview (first 100 chars):', base64.substring(0, 100))

                console.log('[Publish] Setting payload to base64 data')
                props.actions.setPayload(base64)
                console.log('[Publish] Payload set successfully')
              }}
              onError={(error) => {
                props.globalActions.showError(error)
              }}
              onGenerateRef={protobufGenerateRef}
            />
          ) : (
            <Editor
              value={props.payload}
              editorMode={props.editorMode}
              onChange={props.actions.setPayload}
              editorRef={editorRef as any}
            />
          )}
          <RetainSwitch />
        </div>
        <PublishHistory history={history} />
      </div>
    ),
    [props.payload, props.editorMode, history, handleSubmit, publish]
  )
}

const EditorMode = memo(function EditorMode(props: {
  payload?: string
  editorMode: string
  focusEditor: () => void
  actions: typeof publishActions
  globalActions: typeof globalActions
  publish: () => void
  connectionId?: string
  isGenerating?: boolean
}) {
  const updatePayload = props.actions.setPayload

  const updateMode = useCallback((e: React.ChangeEvent<{}>, value: string) => {
    props.actions.setEditorMode(value)
  }, [])

  const openFile = useCallback(() => {
    props.actions.openFile()
  }, [])

  const formatJson = useCallback(() => {
    if (props.payload) {
      try {
        const str = JSON.stringify(JSON.parse(props.payload), undefined, '  ')
        updatePayload(str)
      } catch (error) {
        props.globalActions.showError(`Format error: ${(error as Error)?.message}`)
      }
    }
  }, [props.payload])

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ width: '100%', lineHeight: '64px', textAlign: 'center' }}>
        <EditorModeSelect value={props.editorMode} onChange={updateMode} focusEditor={props.focusEditor} />
        <FormatJsonButton editorMode={props.editorMode} focusEditor={props.focusEditor} formatJson={formatJson} />
        <OpenFileButton editorMode={props.editorMode} openFile={openFile} />
        <div style={{ float: 'right' }}>
          <PublishButton publish={props.publish} focusEditor={props.focusEditor} isGenerating={props.isGenerating} />
        </div>
      </div>
    </div>
  )
})

const FormatJsonButton = React.memo(function FormatJsonButton(props: {
  editorMode: string
  focusEditor: () => void
  formatJson: () => void
}) {
  if (props.editorMode !== 'json') {
    return null
  }

  return (
    <Tooltip title="Format JSON">
      <Fab
        style={{ width: '36px', height: '36px', margin: '0 8px' }}
        onClick={props.formatJson}
        onFocus={props.focusEditor}
        id="sidebar-publish-format-json"
      >
        <FormatAlignLeft style={{ fontSize: '20px' }} />
      </Fab>
    </Tooltip>
  )
})

const OpenFileButton = React.memo(function OpenFileButton(props: { editorMode: string; openFile: () => void }) {
  return (
    <Tooltip title="Open file">
      <Fab
        style={{ width: '36px', height: '36px', margin: '0 8px' }}
        onClick={props.openFile}
        id="sidebar-publish-open-file"
      >
        <AttachFileOutlined style={{ fontSize: '20px' }} />
      </Fab>
    </Tooltip>
  )
})

const PublishButton = memo(function PublishButton(props: { publish: () => void; focusEditor: () => void; isGenerating?: boolean }) {
  const handleClickPublish = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      props.publish()
    },
    [props.publish]
  )

  return (
    <Button
      variant="contained"
      size="small"
      color="primary"
      onClick={handleClickPublish}
      onFocus={props.focusEditor}
      id="publish-button"
    >
      <Navigation style={{ marginRight: '8px' }} />
      {props.isGenerating ? 'Generating...' : 'Publish'}
    </Button>
  )
})

const mapDispatchToProps = (dispatch: any) => {
  return {
    actions: bindActionCreators(publishActions, dispatch),
    globalActions: bindActionCreators(globalActions, dispatch),
  }
}

const mapStateToProps = (state: AppState) => {
  return {
    topic: state.publish.manualTopic,
    payload: state.publish.payload,
    editorMode: state.publish.editorMode,
    retain: state.publish.retain,
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(withTheme(Publish))
