const Parser = require('./parser')
const { Duplex } = require('streamx')

const IS_REQUEST = 0
const IS_RESPONSE = 1
const IS_ERROR = 2

const ERROR = {
  encode (err, buf, offset) {
    return BINARY.encode(err.message, buf, offset)
  },
  decode (buf, offset) {
    const data = BINARY.decode(buf, offset)
    return new Error(data.toString())
  },
  encodingLength (err) {
    return BINARY.encodingLength(err.message)
  }
}

const BINARY = {
  encode (data, buf, offset) {
    if (!buf) return data
    if (!Buffer.isBuffer(data)) data = Buffer.from(data)
    data.copy(buf.slice(offset || 0))
    return buf
  },
  decode (buf, offset) {
    return buf.slice(offset || 0)
  },
  encodingLength (data) {
    return Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data)
  }
}

const NULL = {
  encode (data, buf, offset) {
    return buf || Buffer.alloc(0)
  },
  decode (buf, offset) {
    return null
  },
  encodingLength (data) {
    return 0
  }
}

module.exports = class RPC extends Duplex {
  constructor (opts = {}) {
    super()

    this.methods = []
    this.requests = []
    this.free = []
    this.errorEncoding = opts.errorEncoding || ERROR

    this.parser = new Parser({ onmessage: this._onmessage.bind(this) })
  }

  static ERROR = ERROR
  static NULL = NULL
  static BINARY = BINARY

  _free (id) {
    const req = this.requests[id]

    if (!req) {
      this.destroy('No request found for response')
      return null
    }

    this.requests[id] = null
    this.free.push(id)
    return req
  }

  async _onmessage (type, method, id, message) {
    const m = this.methods[method]

    if (!m) {
      if (IS_REQUEST) {
        this._push(IS_ERROR, method, id, new Error(`Unknown method (${method})`), this.errorEncoding)
      } else {
        this.destroy('Invalid message')
      }
      return
    }

    switch (type) {
      case IS_RESPONSE: {
        const req = this._free(id)
        if (!req) return

        let res
        try {
          res = m.responseEncoding.decode(message)
        } catch (err) {
          this.destroy(err)
          return
        }

        req.resolve(res)
        return
      }

      case IS_ERROR: {
        const req = this._free(id)
        if (!req) return

        let err
        try {
          err = m.errorEncoding.decode(message)
        } catch (err) {
          this.destroy(err)
          return
        }

        req.reject(err)
        return
      }

      case IS_REQUEST: {
        let req
        try {
          req = m.requestEncoding.decode(message)
        } catch (err) {
          return this.destroy(err)
        }

        if (id === 0) {
          m.onrequest(req)
          return
        }

        let res
        try {
          res = await m.onrequest(req)
        } catch (err) {
          this._push(IS_ERROR, method, id, err, m.errorEncoding)
          return
        }

        this._push(IS_RESPONSE, method, id, res, m.requestEncoding)
        return
      }
    }
  }

  _push (type, method, id, message, enc) {
    let buf

    try {
      buf = this.parser.send(type, method, id, message, enc)
    } catch (err) {
      this.destroy(err)
      return false
    }

    this.push(buf)
    return true
  }

  _write (data, cb) {
    if (!this.parser.recv(data)) return cb(new Error('Invalid incoming data'))
    cb(null)
  }

  get inflightRequests () {
    return this.requests.length - this.free.length
  }

  defineMethod (opts) {
    const id = opts.id === undefined ? this.methods.length : opts.id
    while (this.methods.length <= id) this.methods.push(null)
    const m = this.methods[id] = new Method(this, id, opts)
    return m
  }

  _request (method, message) {
    if (!this.free.length) {
      this.free.push(this.requests.length)
      this.requests.push(null)
    }

    const id = this.free.pop()

    this._push(IS_REQUEST, method.id, id, message, method.requestEncoding)

    return new Promise((resolve, reject) => {
      this.requests[id] = {
        method,
        resolve,
        reject
      }
    })
  }

  _requestNoReply (method, message) {
    this._push(IS_REQUEST, method.id, 0, message, method.requestEncoding)
  }
}

class Method {
  constructor (rpc, id, opts) {
    this.rpc = rpc
    this.id = id
    this.requestEncoding = opts.requestEncoding || BINARY
    this.responseEncoding = opts.responseEncoding || BINARY
    this.errorEncoding = opts.errorEncoding || rpc.errorEncoding
    this.onrequest = opts.onrequest || null
  }

  request (val) {
    return this.rpc._request(this, val)
  }

  requestNoReply (val) {
    return this.rpc._requestNoReply(this, val)
  }
}
