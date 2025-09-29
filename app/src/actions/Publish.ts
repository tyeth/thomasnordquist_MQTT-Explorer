import { Action, ActionTypes } from '../reducers/Publish'
import { AppState } from '../reducers'
import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { Dispatch } from 'redux'
import { MqttMessage, makePublishEvent, rendererEvents, rendererRpc, readFromFile } from '../../../events'
import { makeOpenDialogRpc } from '../../../events/OpenDialogRequest'
import { showError } from './Global'
import { Base64 } from 'js-base64'

export const setTopic = (topic?: string): Action => {
  return {
    topic,
    type: ActionTypes.PUBLISH_SET_TOPIC,
  }
}

export const openFile = (encoding: 'utf8' = 'utf8') => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  try {
    const file = await getFileContent(encoding)
    if (file) {
      dispatch(
        setPayload(file.data))
    }
  } catch (error) {
    dispatch(showError(error))
  }
}

type FileParameters = {
  name: string,
  data: string
}
async function getFileContent(encoding: string): Promise<FileParameters | undefined> {
  const rejectReasons = {
    noFileSelected: 'No file selected',
    errorReadingFile: 'Error reading file'
  }

  const { canceled, filePaths } = await rendererRpc.call(makeOpenDialogRpc(), {
    properties: ['openFile'],
    securityScopedBookmarks: true,
  })

  if (canceled) {
    return
  }

  const selectedFile = filePaths[0]
  if (!selectedFile) {
    throw rejectReasons.noFileSelected
  }
  try {
    const data = await rendererRpc.call(readFromFile, { filePath: selectedFile, encoding })
    return { name: selectedFile, data: data.toString(encoding) }
  } catch (error) {
    throw rejectReasons.errorReadingFile
  }
}

export const setPayload = (payload?: string): Action => {
  return {
    payload,
    type: ActionTypes.PUBLISH_SET_PAYLOAD,
  }
}

export const setQoS = (qos: 0 | 1 | 2): Action => {
  return {
    qos,
    type: ActionTypes.PUBLISH_SET_QOS,
  }
}

export const setEditorMode = (editorMode: string): Action => {
  return {
    editorMode,
    type: ActionTypes.PUBLISH_SET_EDITOR_MODE,
  }
}

export const publish = (connectionId: string) => (dispatch: Dispatch<Action>, getState: () => AppState) => {
  console.log('[PublishAction] publish action called with connectionId:', connectionId)

  const state = getState()
  const topic = state.publish.manualTopic ?? state.tree.get('selectedTopic')?.path()
  console.log('[PublishAction] Topic:', topic)
  console.log('[PublishAction] Manual topic:', state.publish.manualTopic)
  console.log('[PublishAction] Selected topic from tree:', state.tree.get('selectedTopic')?.path())

  if (!topic) {
    console.error('[PublishAction] No topic available, aborting publish')
    return
  }

  const publishEvent = makePublishEvent(connectionId)
  console.log('[PublishAction] Publish event:', publishEvent)
  console.log('[PublishAction] Payload string length:', state.publish.payload?.length)
  console.log('[PublishAction] Payload string preview (first 100):', state.publish.payload?.substring(0, 100))

  const payloadBase64Message = state.publish.payload ? new Base64Message(state.publish.payload) : null
  if (payloadBase64Message) {
    console.log('[PublishAction] Base64Message created, buffer size:', payloadBase64Message.toBuffer().byteLength)
    const buffer = new Uint8Array(payloadBase64Message.toBuffer())
    console.log('[PublishAction] Binary payload bytes (first 20):', Array.from(buffer.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '))
  }

  const mqttMessage: Partial<MqttMessage> = {
    topic,
    payload: payloadBase64Message,
    retain: state.publish.retain,
    qos: state.publish.qos,
  }
  console.log('[PublishAction] MQTT message object:', {
    topic: mqttMessage.topic,
    payloadSize: payloadBase64Message ? payloadBase64Message.toBuffer().byteLength : 0,
    retain: mqttMessage.retain,
    qos: mqttMessage.qos
  })

  console.log('[PublishAction] Emitting publish event')
  rendererEvents.emit(publishEvent, mqttMessage)
  console.log('[PublishAction] Publish event emitted successfully')
}

export const toggleRetain = (): Action => {
  return {
    type: ActionTypes.PUBLISH_TOGGLE_RETAIN,
  }
}
