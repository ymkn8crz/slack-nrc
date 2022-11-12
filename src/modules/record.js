// TODO 他チャンネルに投稿するときに使う
module.exports = (sendUser, sendChannel,messageTs) => {
  let messageDateTime = new Date(messageTs * 1000)
  return [
    {
      type: "section",
      text:{
        type: "mrkdwn",
        text: `【進捗確認記録】from <@${sendUser.username}> in <#${sendChannel.id}> at ${messageDateTime.toLocaleString('ja-JP')}`
      }
    },
  ]
}