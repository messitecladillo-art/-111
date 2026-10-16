"""Synthetic independent byte assertions and the same frozen TS/Python vectors."""
import copy
import hashlib
import json
import math
from pathlib import Path

import pytest

from evix_api.topic_transfer_hash import encode_topic_transfer, topic_transfer_hash


FIXTURE = json.loads((Path(__file__).resolve().parents[3] / "packages/evi-x-shared/fixtures/topic-transfer-hash-v1.json").read_text(encoding="utf-8"))
DOMAIN = b"evix-topic-transfer-json/1\0"


@pytest.mark.parametrize("value,body", [
    (None, b"N"), (True, b"T"), (False, b"F"), (0, b"D0000000000000000"), (-0.0, b"D0000000000000000"),
    (1, b"D3ff0000000000000"), (1.0, b"D3ff0000000000000"), (-2.5, b"Dc004000000000000"),
    ("", b"S0:"), ("汉😀", "S7:汉😀".encode("utf-8")), ([], b"A0:"), ({}, b"O0:"),
    ([None, "x"], b"A2:NS1:x"), ({"b": False, "a": True}, b"O2:S1:aTS1:bF"),
])
def test_manual_bytes_fix_domain_tags_lengths_and_number_representation(value, body):
    assert encode_topic_transfer(value) == DOMAIN + body


@pytest.mark.parametrize("sample", FIXTURE["cases"], ids=lambda sample: sample["id"])
def test_frozen_cross_runtime_full_bytes_and_sha256(sample):
    expected = bytes.fromhex(sample["encodedHex"])
    assert hashlib.sha256(expected).hexdigest() == sample["sha256"]
    value = json.loads(sample["inputJson"])
    assert encode_topic_transfer(value) == expected
    assert topic_transfer_hash(value) == sample["sha256"]


@pytest.mark.parametrize("sample", FIXTURE["invalidCases"], ids=lambda sample: sample["id"])
def test_frozen_invalid_values(sample):
    value = json.loads(sample["inputJson"])
    with pytest.raises(ValueError):
        encode_topic_transfer(value)
    with pytest.raises(ValueError):
        topic_transfer_hash(value)


def test_nested_keys_use_utf16_instead_of_python_codepoint_or_insertion_order():
    first = {"\ue000": {"z": 0, "\U00010000": 1}, "😀": 2, "a": 3}
    second = {"a": 3, "😀": 2, "\ue000": {"\U00010000": 1, "z": -0.0}}
    encoded = encode_topic_transfer(first)
    assert encoded == encode_topic_transfer(second)
    assert topic_transfer_hash(first) == topic_transfer_hash(second)
    assert encoded.index("S4:😀".encode()) < encoded.index("S3:\ue000".encode())


def test_json_number_semantics_and_string_normalization_are_explicit():
    assert topic_transfer_hash(1) == topic_transfer_hash(1.0)
    assert topic_transfer_hash(0) == topic_transfer_hash(-0.0)
    assert topic_transfer_hash(2**53 + 1) == topic_transfer_hash(2**53)
    assert topic_transfer_hash("é") != topic_transfer_hash("e\u0301")
    assert topic_transfer_hash("\ud83d\ude00") == topic_transfer_hash("😀")
    assert encode_topic_transfer({"\ud83d\ude00": "x"}) == encode_topic_transfer({"😀": "x"})
    with pytest.raises(ValueError):
        encode_topic_transfer({"\ud83d\ude00": 1, "😀": 2})


def test_tags_and_length_framing_distinguish_types_values_and_array_order():
    values = [None, False, 0, "", "N", "0", [], {}, ["a", "bc"], ["ab", "c"], ["b", "a"], ["a", "b"]]
    assert len({topic_transfer_hash(value) for value in values}) == len(values)


@pytest.mark.parametrize("value", [
    float("nan"), float("inf"), -float("inf"), 10**400, b"x", bytearray(b"x"), (), set(), frozenset(),
    object(), complex(1), {1: "x"}, {False: "x"}, {None: "x"}, {"x": {"constructor": 1}},
])
def test_non_json_and_nonfinite_values_raise_value_error(value):
    with pytest.raises(ValueError):
        encode_topic_transfer(value)


def test_subclasses_and_conversion_hooks_are_not_evaluated():
    calls = []

    class Custom:
        def __float__(self):
            calls.append("float")
            raise AssertionError("must not run")

    class CustomDict(dict):
        def items(self):
            calls.append("items")
            raise AssertionError("must not run")

    class CustomList(list):
        pass

    class CustomInt(int):
        pass

    class CustomString(str):
        pass

    for value in (Custom(), CustomDict(), CustomList(), CustomInt(1), CustomString("x"), {CustomString("x"): 1}):
        with pytest.raises(ValueError):
            encode_topic_transfer(value)
    assert calls == []


def test_depth_and_value_nodes_have_exact_boundaries_and_cycles_fail():
    nested = None
    for _ in range(16):
        nested = [nested]
    encode_topic_transfer(nested)
    with pytest.raises(ValueError):
        encode_topic_transfer([nested])
    encode_topic_transfer([None] * 159_999)
    with pytest.raises(ValueError):
        encode_topic_transfer([None] * 160_000)
    cycle = []
    cycle.append(cycle)
    with pytest.raises(ValueError):
        encode_topic_transfer(cycle)


def test_exact_two_megabyte_boundary_includes_domain_and_typed_framing():
    length = 2_000_000 - len(DOMAIN) - 9  # S + seven decimal digits + colon
    exact = "x" * length
    encoded = encode_topic_transfer(exact)
    assert len(encoded) == 2_000_000
    assert topic_transfer_hash(exact) == hashlib.sha256(encoded).hexdigest()
    with pytest.raises(ValueError):
        encode_topic_transfer(exact + "x")
    with pytest.raises(ValueError):
        encode_topic_transfer("汉" * 700_000)


def test_input_is_unchanged_and_returned_bytes_are_independent():
    value = {"x": [-0.0, "😀"], "a": {"b": 1}}
    before = copy.deepcopy(value)
    first = encode_topic_transfer(value)
    assert isinstance(first, bytes)
    assert value == before
    assert math.copysign(1, value["x"][0]) == -1
    other = encode_topic_transfer(value)
    assert other == first
    assert other is not first
