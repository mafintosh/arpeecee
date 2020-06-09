const RPC = require('./')

const a = new RPC()
const b = new RPC()

b.defineMethod({
  id: 1,
  requestEncoding: RPC.BINARY,
  responseEncoding: RPC.NULL,
  onrequest (val) {
    console.log('hi!', val)
  }
})

a.pipe(b).pipe(a)

const m = a.defineMethod({
  id: 1,
  responseEncoding: RPC.NULL
})

m.request('data')
  .then(console.log)
  .catch(console.log)
