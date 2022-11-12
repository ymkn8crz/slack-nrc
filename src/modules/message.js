module.exports = (msgText, msgUser, msgTs) => {
  let msgDateTime = new Date(msgTs * 1000)
  let sliceMsgText;
  if (msgText.length > 50) {
    sliceMsgText = msgText.replace(/\r?\n/g, ' ').slice(0, 50) + "....."
  } else {
    sliceMsgText = msgText.replace(/\r?\n/g, ' ')
  }
  
  let msgValue = JSON.stringify({
    text: msgText,
    user: msgUser,
    ts: msgTs
  })
  
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `>${sliceMsgText} \n by <@${msgUser}> at ${msgDateTime.toLocaleString('ja-JP')}`
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '更新',
          },
          style: 'primary',
          action_id: 'update',
          value: msgValue,
        }
      ]
    }
  ]
}