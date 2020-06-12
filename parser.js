const varint = require('varint')

module.exports = class Parser {
  constructor ({ maxSize = 8 * 1024 * 1024, onmessage = null, onmissing = null } = {}) {
    this._message = null
    this._ptr = 0
    this._varint = 0
    this._factor = 1
    this._length = 0
    this._method = 0
    this._header = 0
    this._id = 0
    this._state = 0
    this._consumed = 0
    this._maxSize = maxSize

    this.receiving = false
    this.destroyed = false
    this.error = null
    this.onmessage = onmessage
    this.onmissing = onmissing
  }

  destroy (err) {
    if (err) this.error = err
    this.destroyed = true
  }

  recv (data) {
    if (this.receiving === true) throw new Error('Cannot recursively receive data')
    this.receiving = true

    let offset = 0
    while (offset < data.length) {
      if (this._state === 4) offset = this._readMessage(data, offset)
      else offset = this._readVarint(data, offset)
    }
    if (this._state === 4 && this._length === 0) {
      this._readMessage(data, offset)
    }

    this.receiving = false
    return !this.destroyed
  }

  _readMessage (data, offset) {
    const free = data.length - offset
    if (free >= this._length) {
      if (this._message) {
        data.copy(this._message, this._message.length - this._length, offset)
      } else {
        this._message = data.slice(offset, offset + this._length)
      }
      return this._nextState(data, offset += this._length) ? offset : data.length
    }

    if (!this._message) this._message = Buffer.allocUnsafe(this._length)
    data.copy(this._message, this._message.length - this._length, offset)
    this._length -= free

    return data.length
  }

  _readVarint (data, offset) {
    for (; offset < data.length; offset++) {
      this._varint += (data[offset] & 127) * this._factor
      this._consumed++
      if (data[offset] < 128) return this._nextState(data, ++offset) ? offset : data.length
      this._factor *= 128
    }
    if (this._consumed >= 8) this.destroy(new Error('Incoming varint is invalid')) // 8 * 7bits is 56 ie max for js
    return data.length
  }

  _nextState (data, offset) {
    switch (this._state) {
      case 0:
        this._state = 1
        this._factor = 1
        this._length = this._varint
        this._consumed = this._varint = 0
        if (this._length === 0) this._state = 0
        return true

      case 1:
        this._state = 2
        this._factor = 1
        this._header = this._varint
        this._length -= this._consumed
        this._consumed = this._varint = 0
        if (this._length <= 0) {
          this.destroy(new Error('Missing method'))
          return false
        }
        return true

      case 2:
        this._state = 3
        this._factor = 1
        this._method = this._varint
        this._length -= this._consumed
        this._consumed = this._varint = 0
        if (this._length <= 0) {
          this.destroy(new Error('Missing id'))
          return false
        }
        return true

      case 3:
        this._state = 4
        this._factor = 1
        this._id = this._varint
        this._length -= this._consumed
        this._consumed = this._varint = 0
        if (this._length < 0 || this._length > this._maxSize) {
          this.destroy(new Error('Incoming message is larger than max size'))
          return false
        }
        if (this.onmissing) {
          const extra = data.length - offset
          if (this._length > extra) this.onmissing(this._length - extra)
        }
        return true

      case 4:
        this._state = 0
        this.onmessage(this._header & 3, this._header >> 2, this._method, this._id, this._message, data, offset)
        this._message = null
        return !this.destroyed

      default:
        return false
    }
  }

  send (type, service, method, id, message, enc) {
    const header = (service << 2) | type
    const length = enc.encodingLength(message) + varint.encodingLength(header) + varint.encodingLength(method) + varint.encodingLength(id)
    const payload = Buffer.allocUnsafe(varint.encodingLength(length) + length)

    varint.encode(length, payload, 0)
    let offset = varint.encode.bytes
    varint.encode(header, payload, offset)
    offset += varint.encode.bytes
    varint.encode(method, payload, offset)
    offset += varint.encode.bytes
    varint.encode(id, payload, offset)

    enc.encode(message, payload, offset + varint.encode.bytes)

    return payload
  }
}
