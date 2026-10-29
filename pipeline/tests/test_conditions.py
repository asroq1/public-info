from app.conditions import parse_conditions


def row(**flags):
    base = {"서비스ID": "X", "JA0110": None, "JA0111": None}
    base.update(flags)
    return base


def test_age_range_and_unbounded():
    assert parse_conditions(row(JA0110=18, JA0111=39))["a"] == [18, 39]
    assert parse_conditions(row(JA0110=0, JA0111=120, JA0101="Y"))["g"] == ["M"]
    assert "a" not in parse_conditions(row(JA0110=0, JA0111=120, JA0101="Y"))
    assert parse_conditions(row(JA0110=65, JA0111=120))["a"] == [65, None]


def test_sex_and_income():
    c = parse_conditions(row(JA0101="Y", JA0102="Y", JA0201="Y", JA0202="Y"))
    assert c["g"] == ["M", "F"]
    assert c["i"] == [1, 2]


def test_person_household_codes_strip_prefix():
    c = parse_conditions(row(JA0302="Y", JA0328="Y", JA0403="Y"))
    assert c["p"] == ["0302", "0328"]
    assert c["h"] == ["0403"]


def test_business_flag():
    assert parse_conditions(row(JA1102="Y"))["b"] == 1
    assert parse_conditions(row(JA2201="Y"))["b"] == 1


def test_no_conditions_is_marked():
    assert parse_conditions(row()) == {"nc": 1}
