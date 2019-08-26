//! A set of utilities.
//!

pub fn output_result(result: std::io::Result<std::process::Output>) -> Result<String, String> {
    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8(output.stdout).expect("Failed to read stdout").trim().to_string())
            } else {
                Err(format!("{}", output.status))
            }
        },
        Err(err) => match err.kind() {
            _ => Err(format!("{}", err))
        }
    }
}