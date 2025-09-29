import * as React from 'react'
import { AppState } from '../../reducers'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { settingsActions } from '../../actions'
import { rendererRpc, selectProtobufFolder } from '../../../../events'
import { GenericProtobufSchemaLoader } from '../../decoders/protobuf/GenericProtobufSchemaLoader'

import {
  Button,
  Typography,
  Tooltip,
  Box,
} from '@material-ui/core'

interface Props {
  actions: {
    settings: typeof settingsActions
  }
  protobufSchemaFolder?: string
}

class ProtobufSchemaFolder extends React.PureComponent<Props> {
  private handleSelectFolder = async () => {
    try {
      const folderPath = await rendererRpc.call(selectProtobufFolder, undefined, 10000)

      if (folderPath) {
        this.props.actions.settings.setProtobufSchemaFolder(folderPath)

        // Update the schema loader with the new folder
        const schemaLoader = GenericProtobufSchemaLoader.getInstance()
        schemaLoader.setSchemaFolder(folderPath)

        console.log('[ProtobufSchemaFolder] Set protobuf schema folder to:', folderPath)
      }
    } catch (error) {
      console.error('[ProtobufSchemaFolder] Failed to select folder:', error)
    }
  }

  private handleClearFolder = () => {
    this.props.actions.settings.setProtobufSchemaFolder(undefined)

    // Clear the schema loader
    const schemaLoader = GenericProtobufSchemaLoader.getInstance()
    schemaLoader.setSchemaFolder('')

    console.log('[ProtobufSchemaFolder] Cleared protobuf schema folder')
  }

  public render() {
    const { protobufSchemaFolder } = this.props

    return (
      <Box style={{ padding: '8px' }}>
        <Typography variant="subtitle2" style={{ marginBottom: '8px' }}>
          Protobuf Schema Folder
        </Typography>

        {protobufSchemaFolder ? (
          <Box>
            <Tooltip title={protobufSchemaFolder} placement="top">
              <Typography
                variant="body2"
                style={{
                  marginBottom: '8px',
                  color: 'text.secondary',
                  wordBreak: 'break-all',
                  fontSize: '0.75rem'
                }}
              >
                {protobufSchemaFolder.length > 50
                  ? `...${protobufSchemaFolder.slice(-50)}`
                  : protobufSchemaFolder
                }
              </Typography>
            </Tooltip>
            <Box style={{ display: 'flex', gap: '8px' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={this.handleSelectFolder}
              >
                Change
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={this.handleClearFolder}
              >
                Clear
              </Button>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography
              variant="body2"
              style={{
                marginBottom: '8px',
                color: 'text.secondary',
                fontStyle: 'italic'
              }}
            >
              No folder selected
            </Typography>
            <Tooltip
              title="Select a folder containing .proto files to enable protobuf message decoding"
              placement="top"
            >
              <Button
                size="small"
                variant="outlined"
                onClick={this.handleSelectFolder}
              >
                Select Folder
              </Button>
            </Tooltip>
          </Box>
        )}
      </Box>
    )
  }
}

const mapStateToProps = (state: AppState) => {
  return {
    protobufSchemaFolder: state.settings.get('protobufSchemaFolder'),
  }
}

const mapDispatchToProps = (dispatch: any) => {
  return {
    actions: {
      settings: bindActionCreators(settingsActions, dispatch),
    },
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(ProtobufSchemaFolder)