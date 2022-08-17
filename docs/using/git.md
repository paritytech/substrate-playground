One can `git push` changes done in a playground session using the following steps:

```shell
git checkout main
git pull
git remote add my-fork https://github.com/ORG/REPO.git # e.g. https://github.com/jeluard/substrate-node-template.git
git fetch my-fork

git config --global user.email "you@example.com"
git config --global user.name "Your Name"

# Go create a Personal access tokens (PAT) with at least repo access at https://github.com/settings/tokens
# Use it as value for `password` prompted when you `git commit`
# See https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token

git commit
git push my-fork
```
