//! A set of utilities.
//!

use std::{
    collections::HashMap,
    fs::File,
    io::{self, prelude::*},
    path::Path,
};

pub fn read(path: &Path) -> io::Result<String> {
    let mut f = File::open(path)?;
    let mut s = String::new();
    match f.read_to_string(&mut s) {
        Ok(_) => Ok(s),
        Err(e) => Err(e),
    }
}

pub fn parse_images(s: String) -> HashMap<String, String> {
    s.lines()
        .map(|kv| kv.split('=').collect::<Vec<&str>>())
        .map(|vec| {
            assert_eq!(vec.len(), 2);
            (vec[0].to_string().trim().to_string(), vec[1].to_string().trim().to_string())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_images() {
        assert_eq!(parse_images("".to_string()), {});

        let res = [("A".to_string(), "1".to_string()), ("B".to_string(), "2".to_string())]
                .iter().cloned().collect();
        assert_eq!(parse_images("A=1\nB=2".to_string()), res);
    }

}