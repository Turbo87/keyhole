use keyhole_engine::ENGINE_VERSION;

#[test]
fn engine_version_starts_at_one() {
    assert_eq!(ENGINE_VERSION, 1);
}
