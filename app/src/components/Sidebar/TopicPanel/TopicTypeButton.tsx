import React, { useCallback, useMemo } from 'react'
import * as q from '../../../../../backend/src/Model'
import ClickAwayListener from '@material-ui/core/ClickAwayListener'
import Grow from '@material-ui/core/Grow'
import Button from '@material-ui/core/Button'
import Paper from '@material-ui/core/Paper'
import Popper from '@material-ui/core/Popper'
import MenuItem from '@material-ui/core/MenuItem'
import MenuList from '@material-ui/core/MenuList'
import WarningRounded from '@material-ui/icons/WarningRounded'
import { MessageDecoder, decoders } from '../../../decoders'
import { Tooltip } from '@material-ui/core'

export const TopicTypeButton = (props: { node?: q.TreeNode<any> }) => {
  const { node } = props
  if (!node || !node.message || !node.message.payload) {
    return null
  }

  const decoderOptions = decoders.flatMap(decoder => decoder.formats.map(format => [decoder, format] as const))
  const clearOption: [null, string] = [null, 'Clear Decoder']
  const options = [clearOption, ...decoderOptions]

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
  const [open, setOpen] = React.useState(false)

  const selectOption = useCallback(
    (decoder: MessageDecoder | null, format: string) => {
      if (!node) {
        return
      }

      if (decoder === null) {
        // Clear decoder
        node.viewModel.decoder = undefined
        // Also clear the default protobuf message type
        node.viewModel.setDefaultProtobufMessageType(undefined)
      } else {
        node.viewModel.decoder = { decoder, format }
      }
      setOpen(false)
    },
    [node]
  )

  const handleToggle = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation()
      if (open === true) {
        return
      }
      setAnchorEl(event.currentTarget)
      setOpen(prevOpen => !prevOpen)
    },
    [open]
  )

  const handleClose = useCallback((event: React.MouseEvent<Document, MouseEvent>) => {
    if (anchorEl && anchorEl.contains(event.target as HTMLElement)) {
      return
    }
    setOpen(false)
  }, [])

  return (
    <Button onClick={handleToggle}>
      {props.node?.viewModel?.decoder?.format ?? 'No Decoder'}
      <Popper open={open} anchorEl={anchorEl} role={undefined} transition>
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin: placement === 'bottom' ? 'center top' : 'center bottom',
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList id="topicTypeMode">
                  {options.map(([decoder, format], index) => (
                    <MenuItem
                      key={decoder ? format : 'clear'}
                      selected={decoder === null ? !node?.viewModel?.decoder : node?.viewModel?.decoder?.format === format}
                      onClick={() => selectOption(decoder, format)}
                    >
                      {decoder ? <DecoderStatus decoder={decoder} format={format} node={node} /> : format}
                    </MenuItem>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </Button>
  )
}

function DecoderStatus({ node, decoder, format }: { node: q.TreeNode<any>; decoder: MessageDecoder | null; format: string }) {
  const decoded = useMemo(() => {
    return decoder && node.message?.payload ? decoder.decode(node.message?.payload, format) : null
  }, [node.message, decoder, format])

  return decoded?.error ? (
    <Tooltip title={decoded.error}>
      <div>
        {format} <WarningRounded />
      </div>
    </Tooltip>
  ) : (
    <>{format}</>
  )
}
