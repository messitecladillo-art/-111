"""evix-topic-transfer-json/1, separate from every existing persisted hash.

Typed bytes are a hash encoding, not JSON or a clone format. Limits include the
domain prefix: 2,000,000 bytes, depth 16 (root 0), 160,000 value nodes; object
keys are not additional value nodes. Call the existing strict JSON reader at
the API boundary to reject duplicate members before constructing a dict.
"""
import hashlib
import math
import struct


_DOMAIN = b"evix-topic-transfer-json/1\0"
_MAX_BYTES = 2_000_000
_MAX_DEPTH = 16
_MAX_NODES = 160_000
_FORBIDDEN = frozenset(("__proto__", "prototype", "constructor"))


def _string_bytes(value):
    if len(value) > _MAX_BYTES:
        raise ValueError("Topic transfer: encoded input exceeds 2,000,000 bytes.")
    try:
        return value.encode("utf-8")
    except UnicodeEncodeError:
        # Python can receive a direct str containing an explicit UTF16 pair.
        # Decode that pair as JS does; a lone surrogate remains invalid. This
        # changes representation, never Unicode normalization (NFC/NFKC).
        try:
            return value.encode("utf-16-be", "surrogatepass").decode("utf-16-be").encode("utf-8")
        except UnicodeError as error:
            raise ValueError("Topic transfer: lone UTF16 surrogate.") from error


def encode_topic_transfer(value) -> bytes:
    """Encode finite JSON values; invalid input raises ValueError.

    Python ints and floats share JSON's binary64 number semantics. Boolean is
    a distinct type. Subclasses and non-JSON containers are rejected.
    """
    output = bytearray()
    nodes = 0

    def append(data):
        if len(data) > _MAX_BYTES - len(output):
            raise ValueError("Topic transfer: encoded input exceeds 2,000,000 bytes.")
        output.extend(data)

    def string(data):
        append(b"S" + str(len(data)).encode("ascii") + b":")
        append(data)

    def visit(current, depth):
        nonlocal nodes
        nodes += 1
        if nodes > _MAX_NODES or depth > _MAX_DEPTH:
            raise ValueError("Topic transfer: input exceeds depth or node limits.")
        kind = type(current)
        if current is None:
            append(b"N")
        elif kind is bool:
            append(b"T" if current else b"F")
        elif kind is str:
            string(_string_bytes(current))
        elif kind in (int, float):
            try:
                number = float(current)
            except (OverflowError, ValueError) as error:
                raise ValueError("Topic transfer: numbers must be finite binary64 values.") from error
            if not math.isfinite(number):
                raise ValueError("Topic transfer: numbers must be finite binary64 values.")
            append(b"D" + struct.pack(">d", 0.0 if number == 0 else number).hex().encode("ascii"))
        elif kind is list:
            if len(current) > _MAX_NODES:
                raise ValueError("Topic transfer: input exceeds node limits.")
            append(b"A" + str(len(current)).encode("ascii") + b":")
            for item in current:
                visit(item, depth + 1)
        elif kind is dict:
            if len(current) > _MAX_NODES:
                raise ValueError("Topic transfer: input exceeds node limits.")
            keys = []
            seen = set()
            for key in current:
                if type(key) is not str or key in _FORBIDDEN:
                    raise ValueError("Topic transfer: only ordinary string object keys are supported.")
                encoded = _string_bytes(key)
                order = key.encode("utf-16-be", "surrogatepass")
                if order in seen:
                    raise ValueError("Topic transfer: duplicate UTF16 object keys.")
                seen.add(order)
                keys.append((order, key, encoded))
            append(b"O" + str(len(keys)).encode("ascii") + b":")
            for _, key, encoded in sorted(keys, key=lambda item: item[0]):
                string(encoded)
                visit(current[key], depth + 1)
        else:
            raise ValueError("Topic transfer: only ordinary JSON values are supported.")

    append(_DOMAIN)
    visit(value, 0)
    return bytes(output)


def topic_transfer_hash(value) -> str:
    return hashlib.sha256(encode_topic_transfer(value)).hexdigest()
