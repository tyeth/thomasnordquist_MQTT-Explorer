import React, { useCallback, useMemo } from 'react'
import * as q from '../../../../../backend/src/Model'
import ClickAwayListener from '@material-ui/core/ClickAwayListener'
import Grow from '@material-ui/core/Grow'
import Button from '@material-ui/core/Button'
import Paper from '@material-ui/core/Paper'
import Popper from '@material-ui/core/Popper'
import MenuItem from '@material-ui/core/MenuItem'
import MenuList from '@material-ui/core/MenuList'
import { TopicDataType } from '../../../../../backend/src/Model/TreeNode'

const DISPLAY_FORMATS: TopicDataType[] = ['json', 'string', 'hex']

export const DisplayFormatButton = (props: { node?: q.TreeNode<any> }) => {
  const { node } = props
  if (!node || !node.message || !node.message.payload) {
    return null
  }

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null)
  const [open, setOpen] = React.useState(false)

  const selectFormat = useCallback(
    (format: TopicDataType) => {
      if (!node) {
        return
      }

      node.type = format
      node.onMerge.dispatch()
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
      {props.node?.type ?? 'json'}
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
                <MenuList id="displayFormatMode">
                  {DISPLAY_FORMATS.map((format) => (
                    <MenuItem
                      key={format}
                      selected={node?.type === format}
                      onClick={() => selectFormat(format)}
                    >
                      {format}
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