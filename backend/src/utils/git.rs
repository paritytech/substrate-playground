use crate::error::{Error, Result};
use git2::{
    build::{CheckoutBuilder, RepoBuilder},
    FetchOptions, RemoteCallbacks,
};
use std::path::Path;

pub fn clone(path: String, url: String) -> Result<()> {
    // https://stackoverflow.com/questions/55141013/how-to-get-the-behaviour-of-git-checkout-in-rust-git2
    let mut cb = RemoteCallbacks::new();
    cb.transfer_progress(|_stats| true);

    let mut co = CheckoutBuilder::new();
    co.progress(|_path, _cur, _total| {});

    let mut fo = FetchOptions::new();
    fo.remote_callbacks(cb);
    RepoBuilder::new()
        .fetch_options(fo)
        .with_checkout(co)
        .clone(&url, Path::new(&path))
        .map_err(|err| Error::Failure(err.to_string()))?;

    Ok(())
}
