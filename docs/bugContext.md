下面是我从日志中抽取的部分上下文，


```
{
  "inquiryState": {
    "status": "invalid",
    "customerEmail": "hshan@rfhic.com",
    "subject": "RE: 回复：Re: Re: Re: 回复：Re: 回复：Re: 回复：Re: 回复：Re: FREQ 3.3~5GHz",
    "latestMessageAt": "2026-06-22T02:10:59.000Z"
  },
  "recentThreadMessages": [
    {
      "direction": "inbound",
      "from": "hshan <hshan@rfhic.com>",
      "to": "dykim@rfhic.com, shira@hzbeat.com",
      "subject": "RE: 回复：Re: Re: Re: 回复：Re: 回复：Re: 回复：Re: 回复：Re: FREQ 3.3~5GHz",
      "receivedAt": "2026-06-19T07:03:20.000Z",
      "cleanBody": "Hello Shira,\n\nThis is Floyd Han, a Procurement Manager from RFHIC.\n\nFirst, thank you for sharing your company profile and bank information with us.\nThe information you provided in your previous email should be sufficient to complete the vendor registration.\n\nHowever, there is one minor issue preventing us from completing the process: the file size of the soft copy. The soft copy of your company profile is too large to upload to our system, so I would like to ask whether you have an alternative version that still contains your full company profile."
    }
  ],
  ...
}
```

```
"contextPayload": {
    "inquiryState": {
        "status": "new",
        "customerEmail": "dykim@rfhic.com",
        "subject": "你有一个网站表单提交的新询盘",
        "latestMessageAt": "2026-06-24T23:44:34.000Z"
    },
    "recentThreadMessages": [
        {
            "direction": "inbound",
            "from": "kimdaeyeob <dykim@rfhic.com>",
            "to": "sales@hzbeat.com",
            "subject": "你有一个网站表单提交的新询盘",
            "receivedAt": "2026-06-10T22:20:15.000Z",
            "cleanBody": "联系人:kimdaeyeob联系邮箱:dykim@rfhic.com联系电话:留言内容:FREQ 3.3~5GHz (1.7GHz BW) , CW 5w , Isolation 12 , return loss 15\nIl : 1.5dB Max / temp -30 ~ 85\nSIZE 10mm X 10mm or less\nType is not critical, but size is important. SMD type is preferred留言时间:2026-06-11 06:20:09"
        },
        ....,
        {
            "direction": "inbound",
            "from": "(Dennis kim) <dykim@rfhic.com>",
            "to": "shira@hzbeat.com, hshan@rfhic.com",
            "subject": "Re: 回复：RE: 回复：RE: 回复：Re: Re: Re: 回复：Re: 回复：Re: 回复：Re: 回复：Re: FREQ 3.3~5GHz",
            "receivedAt": "2026-06-22T09:47:25.000Z",
            "cleanBody": "Hi shira\n\nThe dimensions indicated on the PCB are correct.\nAdditionally, we would like to ask whether it would be possible to implement a TERM port with an internal termination of approximately 5 W, within a 10 × 10 TERM size, using an isolator-type configuration.\nWe are sharing the photo from your company’s website for your reference.\n\n*  The size must remain unchanged."
        }
    ]
}
```