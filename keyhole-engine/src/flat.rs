//! Points and lines on a flat map, in km.
//!
//! The map is always centred on a reference point, but what its axes point
//! to depends on the caller, such as east and north, or along a zone's axis.

/// A point on a flat map, in km from its centre.
#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y
    }
}
